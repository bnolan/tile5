/** 
# T5.Geo.UI.RouteOverlay
_extends:_ T5.PathLayer


The RouteOverlay class is used to render the route geometry to the map.

## Constructor
`new T5.Geo.UI.RouteOverlay(params)`

### Initialization Parameters
To be completed
*/
var RouteOverlay = exports.RouteOverlay = function(params) {
    params = COG.extend({
        data: null,
        pixelGeneralization: 8,
        partialDraw: false,
        strokeStyle: 'rgba(0, 51, 119, 0.9)',
        waypointFillStyle: '#FFFFFF',
        lineWidth: 4,
        zindex: 50
    }, params);
    
    var coordinates = [],
        instructionCoords = [];
    
    function vectorizeRoute() {
        if (params.data && params.data.instructions) {
            var instructions = params.data.instructions,
                positions = new Array(instructions.length);
            
            for (var ii = instructions.length; ii--; ) {
                positions[ii] = instructions[ii].position;
            } // for

            Position.vectorize(positions, {
                callback: function(coords) {
                    instructionCoords = coords;
                }
            });
        } // if
        
        if (params.data && params.data.geometry) {
            Position.vectorize(params.data.geometry, {
                callback: function(coords) {
                    coordinates = coords;
                    
                    // now update the coordinates
                    self.updateCoordinates(coordinates, instructionCoords, true);
                }
            });
        } // if
    } // vectorizeRoute
    
    // create the view layer the we will draw the view
    var self = new T5.PathLayer(params);
    
    // vectorize the data
    vectorizeRoute();
    return self;
};