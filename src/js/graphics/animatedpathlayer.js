/**
# T5.AnimatedPathLayer
_extends:_ T5.ViewLayer


The AnimatedPathLayer is way cool :)  This layer allows you to supply an array of 
screen / grid coordinates and have that animated using the functionality T5.Animation module. 
Any type of T5.PathLayer can generate an animation.

## Constructor
`new T5.AnimatedPathLayer(params);`

### Initialization Parameters

- `path` (T5.Vector[], default = []) - An array of screen / grid coordinates that will 
be used as anchor points in the animation.

- `id` (String, default = 'pathAni%autoinc') - The id of of the animation layer.  The id will start with 
pathAni1 and then automatically increment each time a new AnimatedPathLayer is created unless the id is 
manually specified in the constructor parameters.

- `easing` (easing function, default = COG.easing('sine.inout')) - the easing function to use for the animation

- `drawIndicator` (callback, default = defaultDraw) - A callback function that is called every time the indicator for 
the animation needs to be drawn.  If the parameter is not specified in the constructor the default callback 
is used, which simply draws a small circle at the current position of the animation.

- `duration` (int, default = 2000) - The animation duration.  See T5.Animation module information for more details.


## Draw Indicator Callback Function
`function(context, viewRect, xy, theta)`


The drawIndicator parameter in the constructor allows you to specify a particular callback function that is 
used when drawing the indicator.  The function takes the following arguments:


- `context` - the canvas context to draw to when drawing the indicator
- `viewRect` - the current viewRect to take into account when drawing
- `xy` - the xy position where the indicator should be drawn 
- `theta` - the current angle (in radians) given the path positioning.
*/
var AnimatedPathLayer = function(params) {
    params = COG.extend({
        path: [],
        id: COG.objId('pathAni'),
        easing: COG.easing('sine.inout'),
        validStates: viewState('ACTIVE', 'PAN', 'ZOOM'),
        drawIndicator: null,
        duration: 2000
    }, params);
    
    // generate the edge data for the specified path
    var path = params.path, 
        edgeData = XY.edges(path), 
        tween,
        theta,
        indicatorXY = null,
        drawIndicator = params.drawIndicator ? params.drawIndicator : drawDefaultIndicator,
        pathOffset = 0;
        
    /* internals */
    
    function drawDefaultIndicator(context, viewRect, indicatorXY) {
        // draw an arc at the specified position
        context.fillStyle = "#FFFFFF";
        context.strokeStyle = "#222222";
        context.beginPath();
        context.arc(
            indicatorXY.x, 
            indicatorXY.y,
            4,
            0,
            Math.PI * 2,
            false);             
        context.stroke();
        context.fill();
    } // drawDefaultIndicator
    
    function handleUpdates(updatedValue, complete) {
        pathOffset = updatedValue;

        if (complete) {
            _self.remove();
        } // if
        
        _self.changed();
    }
    
    /* exports */
    
    function cycle(tickCount, viewRect, state, redraw) {
        var edgeIndex = 0;

        // iterate through the edge data and determine the current journey coordinate index
        while ((edgeIndex < edgeData.accrued.length) && (edgeData.accrued[edgeIndex] < pathOffset)) {
            edgeIndex++;
        } // while

        // reset offset xy
        indicatorXY = null;

        // if the edge index is valid, then let's determine the xy coordinate
        if (edgeIndex < path.length-1) {
            var extra = pathOffset - (edgeIndex > 0 ? edgeData.accrued[edgeIndex - 1] : 0),
                v1 = path[edgeIndex],
                v2 = path[edgeIndex + 1];

            theta = XY.theta(v1, v2, edgeData.edges[edgeIndex]);
            indicatorXY = XY.extendBy(v1, theta, extra);
        } // if
        
        return indicatorXY;
    } // cycle
    
    function draw(context, viewRect, state, view) {
        if (indicatorXY && drawIndicator) {
            // if the draw indicator method is specified, then draw
            drawIndicator(
                context,
                viewRect,
                XY.init(indicatorXY.x, indicatorXY.y),
                theta
            );
        } // if
    } // draw
    
    
    // initialise _self
    var _self =  COG.extend(new ViewLayer(params), {
        cycle: cycle,
        draw: draw
    });
    
    // calculate the tween
    COG.tweenValue(0, edgeData.total, params.easing, params.duration, handleUpdates);
        
    return _self;
}; // T5.AnimatedPathLayer
