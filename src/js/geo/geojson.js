// define some constants
var FEATURE_TYPE_COLLECTION = 'featurecollection',
    FEATURE_TYPE_FEATURE = 'feature',
    VECTORIZE_OPTIONS = {
        async: false
    },
    
    DEFAULT_FEATUREDEF = {
        processor: null,
        group: 'shapes',
        layerClass: ShapeLayer
    };

// initialise feature definitions
var featureDefinitions = {
    
    point: COG.extend({}, DEFAULT_FEATUREDEF, {
        processor: processPoint,
        group: 'markers',
        layerClass: ShapeLayer
    }),
    
    linestring: COG.extend({}, DEFAULT_FEATUREDEF, {
        processor: processLineString
    }),
    multilinestring: COG.extend({}, DEFAULT_FEATUREDEF, {
        processor: processMultiLineString
    }),
    
    polygon: COG.extend({}, DEFAULT_FEATUREDEF, {
        processor: processPolygon
    }),
    multipolygon: COG.extend({}, DEFAULT_FEATUREDEF, {
        processor: processMultiPolygon
    })
};

/* feature processor utilities */

function createShape(layer, coordinates, options, builder) {
    var vectors = readVectors(coordinates);
    layer.add(builder(vectors, options));
    
    return vectors.length;
} // createShape

function readVectors(coordinates) {
    var count = coordinates ? coordinates.length : 0,
        positions = new Array(count);
        
    for (var ii = count; ii--; ) {
        positions[ii] = Geo.Position.init(coordinates[ii][1], coordinates[ii][0]);
    } // for

    return Geo.Position.vectorize(positions, VECTORIZE_OPTIONS);
} // getLineStringVectors

/* feature processor functions */

function processLineString(layer, featureData, options, builders) {
    // TODO: check this is ok...
    var vectors = readVectors(featureData && featureData.coordinates ? featureData.coordinates : []);
    
    return createShape(layer, vectors, options, builders.line);
} // processLineString

function processMultiLineString(layer, featureData, options, builders) {
    var coordinates = featureData && featureData.coordinates ? featureData.coordinates : [],
        pointsProcessed = 0;
    
    for (var ii = coordinates.length; ii--; ) {
        pointsProcessed += createShape(layer, coordinates[ii], options, builders.line);
    } // for
    
    return pointsProcessed;
} // processMultiLineString

function processPoint(layer, featureData, options, builders) {
    var points = readVectors([featureData.coordinates], VECTORIZE_OPTIONS);

    if (points.length > 0) {
        var marker = builders.marker(points[0], options);
        
        if (marker) {
            layer.add(marker);
            return points.length;
        } // if
    } // if
} // processPoint

function processPolygon(layer, featureData, options, builders) {
    var coordinates = featureData && featureData.coordinates ? featureData.coordinates : [];
    if (coordinates.length > 0) {
        return createShape(layer, coordinates[0], options, builders.poly);
    } // if
    
    return 0;
} // processPolygon

function processMultiPolygon(layer, featureData, options, builders) {
    var coordinates = featureData && featureData.coordinates ? featureData.coordinates : [],
        pointsProcessed = 0;
    
    for (var ii = 0; ii < coordinates.length; ii++) {
        pointsProcessed += createShape(layer, coordinates[ii][0], options, builders.poly);
    } // for
    
    return pointsProcessed;
} // processMultiPolygon

/* define the GeoJSON parser */

var GeoJSONParser = function(data, callback, options, builders) {
    // initialise the options
    options = COG.extend({
        vectorsPerCycle: Geo.VECTORIZE_PER_CYCLE,
        rowPreParse: null,
        simplify: false,
        layerPrefix: 'geojson-'
    }, options);
    
    // initialise the builders
    builders = COG.extend({
        marker: function(xy, builderOpts) {
            return new Marker({
                xy: xy
            });
        },
        
        line: function(vectors, builderOpts) {
            return new Poly(vectors, COG.extend({}, options, builderOpts));
        },
        
        poly: function(vectors, builderOpts) {
            return new Poly(vectors, COG.extend({
                fill: true
            }, options, builderOpts));
        }
    }, builders);
    
    // initialise variables
    var vectorsPerCycle = options.vectorsPerCycle,
        rowPreParse = options.rowPreParse,
        layerPrefix = options.layerPrefix,
        featureIndex = 0,
        totalFeatures = 0,
        childParser = null,
        childCount = 0,
        layers = {};

    // if we have no data, then exit
    if (! data) {
        return;
    } // if
    
    // check that the data is in an array, if not, then make one
    if (typeof data.length === 'undefined') {
        data = [data];
    } // if
        
    /* parser functions */
    
    function addFeature(definition, featureInfo) {
        var processor = definition.processor, 
            layerId = layerPrefix + definition.group,
            featureOpts = COG.extend({}, definition, options, {
                properties: featureInfo.properties
            });
            
        if (processor) {
            return processor(
                getLayer(layerId, definition.layerClass), 
                featureInfo.data, 
                featureOpts,
                builders);
        } // if
        
        return 0;
    } // addFeature
    
    function extractFeatureInfo(featureData, properties) {
        var featureType = featureData && featureData.type ? featureData.type.toLowerCase() : null;
        
        if (featureType && featureType === FEATURE_TYPE_FEATURE) {
            return extractFeatureInfo(featureData.geometry, featureData.properties);
        }
        else {
            return {
                type: featureType,
                isCollection: (featureType ? featureType === FEATURE_TYPE_COLLECTION : false),
                definition: featureDefinitions[featureType],
                data: featureData,
                properties: properties ? properties : featureData.properties
            };
        } // if..else
    } // extractFeatureInfo
    
    function featureToPoly(feature, callback) {
    } // featureToPrimitives
    
    function getLayer(layerId, layerClass) {
        var layer = layers[layerId];
        
        if (! layer) {
            layer = new layerClass({
                id: layerId
            });
            
            layers[layerId] = layer;
        } // if
        
        globalLayers = layers;
        return layer;
    } // getLayer
    
    function parseComplete(evt) {
        if (callback) {
            callback(layers);
        } // if
    } // parseComplete

    function processData(tickCount) {
        var cycleCount = 0,
            childOpts = COG.extend({}, options),
            ii = featureIndex;
            
        // initialise the tick count if it isn't already defined
        // not all browsers pass through the ticks with the requestAnimationFrame :/
        tickCount = tickCount ? tickCount : new Date().getTime();
            
        // if we have a child worker active, then don't do anything in this worker
        if (childParser) {
            return;
        }
        
        // COG.info('processing data, featureIndex = ' + featureIndex + ', total features = ' + totalFeatures);
        for (; ii < totalFeatures; ii++) {
            // get the feature data
            // if a row preparser is defined, then use that
            var featureInfo = extractFeatureInfo(rowPreParse ? rowPreParse(data[ii]) : data[ii]),
                processedCount = null;
                
            // if we have a collection, then create the child worker to process the features
            if (featureInfo.isCollection) {
                childOpts.layerPrefix = layerPrefix + (childCount++) + '-';
                
                // create the worker
                childParser = parse(
                    featureInfo.data.features, 
                    function(childLayers) {
                        childParser = null;
                        
                        // copy the child layers back
                        for (var layerId in childLayers) {
                            layers[layerId] = childLayers[layerId];
                        } // for
                    }, childOpts);
                    
                processedCount += 1;
            }
            // if the processor is defined, then run it
            else if (featureInfo.definition) {
                processedCount = addFeature(featureInfo.definition, featureInfo);
            } // if..else
            
            // increment the cycle count
            cycleCount += processedCount ? processedCount : 1;
            
            // increase the cycle counter and check that we haven't processed too many
            if (cycleCount >= vectorsPerCycle) {
                break;
            } // if
        } // for
        
        // increment the feature index to the next feature after this loop
        featureIndex = ii + 1;
        
        // if we have finished, then tell the worker we are done
        if (childParser || (featureIndex < totalFeatures)) {
            animFrame(processData);
        }
        else {
            parseComplete();
        }
    } // processData
    
    /* run the parser */
    
    // save the total feature count
    totalFeatures = data.length;
    animFrame(processData);
};

/* exports */

function parse(data, callback, options) {
    return new GeoJSONParser(data, callback, options);
} // parse

var GeoJSON = exports.GeoJSON = (function() {
    return {
        parse: parse
    }; 
})();