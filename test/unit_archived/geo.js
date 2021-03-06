(function() {
    var TESTPOS_1_LAT = -27.468, 
        TESTPOS_1_LON = 153.028,
        TESTPOS_1 = TESTPOS_1_LAT + " " + TESTPOS_1_LON;
    
    new COG.Testing.Suite({
        id: "tile5.geo",
        title: "Suite of tests to Geo operations in Tile5",
        testData: {},
        
        tests: [
        {
            title: "Parse Position",
            runner: function(test, testData) {
                testData.pos1 = T5.Geo.P.parse(TESTPOS_1);
                
                if ((testData.pos1.lat !== TESTPOS_1_LAT) || (testData.pos1.lon !== TESTPOS_1_LON)) {
                    throw new Error("Parsed Position not equal to raw values");
                } // if
            }
        },
        
        {
            title: "Position String Conversion",
            runner: function(test, testData) {
                var testStr = T5.Geo.P.toString(testData.pos1);
                if (testStr != TESTPOS_1) {
                    throw new Error("String output does not equal original input");
                } // if
            }
        },
        
        {
            title: "Position String Conversion (null value)",
            runner: function(test, testData) {
                var testStr = T5.Geo.P.toString();
                if (testStr != "") {
                    throw new Error("String conversion for empty pos not valid");
                }
            }
        },
        
        {
            title: "Parse Created Position",
            runner: function(test, testData) {
                var testPos = T5.Geo.P.parse(testData.pos1);
                
                if ((! testPos) || (testPos.lat !== TESTPOS_1_LAT) || (testPos.lon !== TESTPOS_1_LON)) {
                    throw new Error("Parse existing position failed, testPos (" + T5.Geo.P.toString(testPos) + ") != source (" + T5.Geo.P.toString(testData.pos1) + ")");
                }
            }
        },
        
        { 
            title: 'Mercator Pixel Conversion Equivalence',
            runner: function(text, testData) {
                var origPos = T5.Geo.P.parse(testData.pos1),
                    mercPixels = T5.Geo.P.toMercatorPixels(origPos),
                    testPos = T5.Geo.P.fromMercatorPixels(mercPixels.x, mercPixels.y),
                    factor = Math.pow(10, 3),
                    
                    latEqual = Math.round(origPos.lat * factor) === Math.round(testPos.lat * factor),
                    lonEqual = Math.round(origPos.lon * factor) === Math.round(testPos.lon * factor);
                    
                // check that the positions are equivalent to 5 decimal places
                if ((! latEqual) || (! lonEqual)) {
                    throw new Error('Mercator pixel conversion not equivalent');
                } // if
            }
        },
        
        /* bounding box tests */
        
        {
            title: "Create Bounding Box from Existing Positions",
            runner: function(test, testData) {
                var testBounds = new T5.Geo.BoundingBox(testData.pos1, testData.pos1);
                
                if ((! testBounds) || (! testBounds.min) || (! testBounds.max)) {
                    throw new Error("Bounding box creation failed");
                }
                
                if ((testBounds.min.lat !== testData.pos1.lat) || (testBounds.min.lon !== testData.pos1.lon)) {
                    throw new Error("Bounding box min invalid value");
                } // if
                
                if ((testBounds.max.lat !== testData.pos1.lat) || (testBounds.max.lon !== testData.pos1.lon)) {
                    throw new Error("Bounding box max invalid value");
                } // if
            }
        }
        ]
    });
})();

