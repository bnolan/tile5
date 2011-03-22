/**
# T5.View
The View is the fundamental building block for tiling and 
mapping interface.  Which this class does not implement any of 
the logic required for tiling, it does handle the redraw logic.  
Applications implementing Tile5 maps will not need to be aware of 
the implementation specifics of the View, but for those interested 
in building extensions or customizations should definitely take a look.  
Additionally, it is worth being familiar with the core methods that 
are implemented here around the layering as these are used extensively 
when creating overlays and the like for the map implementations.

## Constructor

<pre>
var view = new T5.View(params);
</pre>

#### Initialization Parameters

- `container` (required)

- `autoSize`

- `id`

- `captureHover` - whether or not hover events should be intercepted by the View.  
If you are building an application for mobile devices then you may want to set this to 
false, but it's overheads are minimals given no events will be generated.

- `inertia`

- `pannable`

- `scalable`

- `panAnimationEasing`

- `panAnimationDuration`

- `fps` - (int, default = 25) - the frame rate of the view, by default this is set to 
25 frames per second but can be increased or decreased to compensate for device 
performance.  In reality though on slower devices, the framerate will scale back 
automatically, but it can be prudent to set a lower framerate to leave some cpu for 
other processes :)

- `turbo` - (bool, default = false) - whether or not all possible performance optimizations
should be implemented.  In this mode certain features such as transparent images in T5.ImageLayer
will not have these effects applied.  Additionally, clipping is disabled and clearing the background
rectangle never happens.  This is serious stuff folks.

- `zoomEasing` - (easing, default = `quad.out`) - The easing effect that should be used when 
the user double taps the display to zoom in on the view.

- `zoomDuration` - (int, default = 300) - If the `zoomEasing` parameter is specified then 
this is the duration for the tween.


## Events

### tapHit
This event is fired when the view has been tapped (or the left
mouse button has been pressed)
<pre>
view.bind('tapHit', function(evt, elements, absXY, relXY, offsetXY) {
});
</pre>

- elements ([]) - an array of elements that were "hit"
- absXY (T5.Vector) - the absolute position of the tap
- relXY (T5.Vector) - the position of the tap relative to the top left position of the view.
- gridXY (T5.Vector) - the xy coordinates of the tap relative to the scrolling grid offset.


### hoverHit
As per the tapHit event, but triggered through a mouse-over event.

### refresh
This event is fired once the view has gone into an idle state or every second
(configurable).
<pre>
view.bind('refresh', function(evt) {
});
</pre>

### drawComplete
Triggered when drawing the view has been completed (who would have thought).
<pre>
view.bind('drawComplete', function(evt, viewRect, tickCount) {
});
</pre>

- offset (T5.Vector) - the view offset that was used for the draw operation
- tickCount - the tick count at the start of the draw operation.


### zoomLevelChange
Triggered when the zoom level of the view has changed.  Given that Tile5 was primarily
built to serve as a mapping platform zoom levels are critical to the design so a view
has this functionality.

<pre>
view.bind('zoomLevelChange', function(evt, zoomLevel) {
});
</pre>

- zoomLevel (int) - the new zoom level


## Methods
*/
var View = function(params) {
    // initialise defaults
    params = COG.extend({
        id: COG.objId('view'),
        container: "",
        captureHover: true,
        captureDrag: false,
        fastDraw: false,
        inertia: true,
        minRefresh: 1000,
        pannable: false,
        clipping: true,
        scalable: false,
        panAnimationEasing: COG.easing('sine.out'),
        panAnimationDuration: 750,
        pinchZoomAnimateTrigger: 400,
        autoSize: true,
        tapExtent: 10,
        guides: false,
        turbo: false,
        fps: 25,
        
        // zoom parameters
        minZoom: 1,
        maxZoom: 1,
        renderer: 'canvas',
        zoomEasing: COG.easing('quad.out'),
        zoomDuration: 300,
        zoomLevel: 1
    }, params);
    
    // initialise constants
    var TURBO_CLEAR_INTERVAL = 500;
    
    // get the container context
    var caps = {},
        layers = [],
        layerCount = 0,
        container = document.getElementById(params.container),
        dragObject = null,
        frameIndex = 0,
        mainContext = null,
        isIE = typeof window.attachEvent != 'undefined',
        flashPolyfill,
        hitFlagged = false,
        minRefresh = params.minRefresh,
        offsetX = 0,
        offsetY = 0,
        lastOffsetX = 0,
        lastOffsetY = 0,
        offsetMaxX = null,
        offsetMaxY = null,
        offsetWrapX = false,
        offsetWrapY = false,
        clipping = params.clipping,
        guides = params.guides,
        deviceScaling = 1,
        wakeTriggers = 0,
        halfWidth = 0,
        halfHeight = 0,
        hitData = null,
        interactOffset = null,
        interactCenter = null,
        interacting = false,
        layerMinXY = null,
        layerMaxXY = null,
        lastRefresh = 0,
        lastClear = 0,
        lastHitData = null,
        rotation = 0,
        resizeCanvasTimeout = 0,
        scaleFactor = 1,
        scaleTween = null,
        lastScaleFactor = 0,
        lastCycleTicks = 0,
        eventMonitor = null,
        turbo = params.turbo,
        tweeningOffset = false,
        cycleDelay = 1000 / params.fps | 0,
        viewChanges = 0,
        zoomX, zoomY,
        zoomLevel = params.zoomLevel,
        
        /* state shortcuts */
        
        stateActive = viewState('ACTIVE'),
        statePan = viewState('PAN'),
        stateZoom = viewState('ZOOM'),
        stateAnimating = viewState('ANIMATING'),
        
        state = stateActive;
        
    /* event handlers */
    
    function handlePan(evt, x, y) {
        if (! dragObject) {
            updateOffset(offsetX - x, offsetY - y);
        } // if
    } // pan
    
    /* scaling functions */
    
    function handleZoom(evt, absXY, relXY, scaleChange, source) {
        scale(min(max(scaleFactor + pow(2, scaleChange) - 1, 0.5), 2));
    } // handleWheelZoom
    
    function scaleView() {
        var scaleFactorExp = log(scaleFactor) / Math.LN2 | 0;
        
        // COG.info('scale factor = ' + scaleFactor + ', exp = ' + scaleFactorExp);
        if (scaleFactorExp !== 0) {
            scaleFactor = pow(2, scaleFactorExp);
            setZoomLevel(zoomLevel + scaleFactorExp, zoomX, zoomY);
        }

        // invalidate the view
        _self.redraw = true;
    } // scaleView
    
    function setZoomCenter(xy) {
    } // setZoomCenter
    
    function getScaledOffset(srcX, srcY) {
        var viewport = _self.getViewport(),
            invScaleFactor = 1 / scaleFactor,
            scaledX = viewport ? (viewport.x1 + srcX * invScaleFactor) : srcX,
            scaledY = viewport ? (viewport.y1 + srcY * invScaleFactor) : srcY;
        
        return XY.init(scaledX, scaledY);        
    } // getScaledOffset
    
    function handleContainerUpdate(name, value) {
        container = document.getElementById(value);
        createRenderer();
    } // handleContainerUpdate
    
    function handleDoubleTap(evt, absXY, relXY) {
        triggerAll(
            'doubleTap', 
            absXY,
            relXY,
            getScaledOffset(relXY.x, relXY.y));
            
        if (params.scalable) {
            // animate the scaling
            scale(2, relXY, params.zoomEasing, null, params.zoomDuration);            
        } // if
    } // handleDoubleTap
    
    function handlePointerDown(evt, absXY, relXY) {
        // reset the hover offset and the drag element
        dragObject = null;

        // initialise the hit data
        initHitData('down', absXY, relXY);
    } // handlePointerDown
    
    function handlePointerHover(evt, absXY, relXY) {
        // initialise the hit data
        initHitData('hover', absXY, relXY);
    } // handlePointerHover
    
    function handlePointerMove(evt, absXY, relXY) {
        dragSelected(absXY, relXY, false);
    } // handlePointerMove
    
    function handlePointerUp(evt, absXY, relXY) {
        dragSelected(absXY, relXY, true);
    } // handlePointerUp
    
    function handleResize(evt) {
        clearTimeout(resizeCanvasTimeout);
        resizeCanvasTimeout = setTimeout(function() {
            renderer.checkSize();
        }, 250);
    } // handleResize
    
    function handleResync(evt, view) {
        // clear the layer min xy and max xy as we have changed zoom levels (or something similar)
        layerMinXY = null;
        layerMaxXY = null;
    } // handleResync
    
    function handleRotationUpdate(name, value) {
        rotation = value;
    } // handlePrepCanvasCallback
    
    function handlePointerTap(evt, absXY, relXY) {
        // initialise the hit data
        initHitData('tap', absXY, relXY);

        // trigger the tap on all layers
        triggerAll('tap', absXY, relXY, getScaledOffset(relXY.x, relXY.y, true));
    } // handlePointerTap
    
    /* private functions */
    
    function createRenderer() {
        renderer = attachRenderer(params.renderer, _self, container);
        
        // attach interaction handlers
        captureInteractionEvents();
    } // createRenderer
    
    function addLayer(id, value) {
        // make sure the layer has the correct id
        value.id = id;
        value.added = ticks();
        
        // tell the layer that I'm going to take care of it
        value.view = _self;
        value.trigger('parentChange', _self, container, mainContext);
        
        // add the new layer
        layers.push(value);
        
        // sort the layers
        layers.sort(function(itemA, itemB) {
            var result = itemB.zindex - itemA.zindex;
            if (result === 0) {
                result = itemB.added - itemA.added;
            } // if
            
            return result;
        });
        
        // update the layer count
        layerCount = layers.length;
        return value;
    } // addLayer
    
    function captureInteractionEvents() {
        if (eventMonitor) {
            eventMonitor.unbind();
        } // if

        if (renderer) {
            // recreate the event monitor
            eventMonitor = INTERACT.watch(renderer.interactTarget);

            // if this is pannable, then attach event handlers
            if (params.pannable) {
                eventMonitor.pannable().bind('pan', handlePan);
            } // if

            // if this view is scalable, attach zooming event handlers
            if (params.scalable) {
                eventMonitor.bind('zoom', handleZoom);
                eventMonitor.bind('doubleTap', handleDoubleTap);
            } // if
            
            // handle pointer down tests
            eventMonitor.bind('pointerDown', handlePointerDown);
            eventMonitor.bind('pointerMove', handlePointerMove);
            eventMonitor.bind('pointerUp', handlePointerUp);

            if (params.captureHover) {
                eventMonitor.bind('pointerHover', handlePointerHover);
            } // if

            // handle tap events
            eventMonitor.bind('tap', handlePointerTap);
        } // if
    } // captureInteractionEvents
    
    /*
    The constrain offset function is used to keep the view offset within a specified
    offset using wrapping if allowed.  The function is much more 'if / then / elsey' 
    than I would like, and might be optimized at some stage, but it does what it needs to
    */
    function constrainOffset(viewport, allowWrap) {
        if (! viewport) {
            return;
        } // if
        
        var testX = offsetWrapX ? offsetX + halfWidth : offsetX,
            testY = offsetWrapY ? offsetY + halfHeight : offsetY,
            viewWidth = viewport.width,
            viewHeight = viewport.height;
        
        // check the x
        if (offsetMaxX && offsetMaxX > viewWidth) {
            if (testX + viewWidth > offsetMaxX) {
                if (offsetWrapX) {
                    offsetX = allowWrap && (testX - offsetMaxX > 0) ? offsetX - offsetMaxX : offsetX;
                }
                else {
                    offsetX = offsetMaxX - viewWidth;
                } // if..else
            }
            else if (testX < 0) {
                offsetX = offsetWrapX ? (allowWrap ? offsetX + offsetMaxX : offsetX) : 0;
            } // if..else
        } // if
        
        // check the y
        if (offsetMaxY && offsetMaxY > viewHeight) {
            if (testY + viewHeight > offsetMaxY) {
                if (offsetWrapY) {
                    offsetY = allowWrap && (testY - offsetMaxY > 0) ? offsetY - offsetMaxY : offsetY;
                }
                else {
                    offsetY = offsetMaxY - viewHeight;
                } // if..else
            }
            else if (testY < 0) {
                offsetY = offsetWrapY ? (allowWrap ? offsetY + offsetMaxY : offsetY) : 0;
            } // if..else
        } // if
    } // constrainOffset
    
    function dragSelected(absXY, relXY, drop) {
        if (dragObject) {
            var scaledOffset = getScaledOffset(relXY.x, relXY.y),
                dragOk = dragObject.drag.call(
                    dragObject.target, 
                    dragObject, 
                    scaledOffset.x, 
                    scaledOffset.y, 
                    drop);
                
            if (dragOk) {
                _self.redraw = true;
            } // if
            
            if (drop) {
                dragObject = null;
            } // if
        }
    } // dragSelected
    
    function dragStart(hitElement, x, y) {
        var canDrag = hitElement && hitElement.drag && 
                ((! hitElement.canDrag) || hitElement.canDrag(hitElement, x, y));
                
        if (canDrag) {
            dragObject = hitElement;

            // initialise the
            dragObject.startX = x;
            dragObject.startY = y;
        } // if

        return canDrag;
    } // dragStart
    
    function getLayerIndex(id) {
        for (var ii = layerCount; ii--; ) {
            if (layers[ii].id === id) {
                return ii;
            } // if
        } // for
        
        return -1;
    } // getLayerIndex
    
    /* draw code */
    
    // TODO: investigate whether to go back to floating point math for improved display or not
    function calcZoomRect(drawRect) {
        var invScaleFactor = 1 / scaleFactor,
            invScaleFactorNorm = (invScaleFactor - 0.5) * 2;
            
        // update the zoomX and y calculations
        zoomX = interactCenter.x + (offsetX - interactOffset.x);
        zoomY = interactCenter.y + (offsetY - interactOffset.y);
        
        /*
        COG.info(
            'scale factor = ' + scaleFactor + 
            ', inv scale factor = ' + invScaleFactor + 
            ', inv scale factor norm = ' + invScaleFactorNorm);
            
        COG.info('zoom x = ' + zoomX + ', y = ' + zoomY);
        COG.info('offset x = ' + offsetX + ', y = ' + offsetY);
        COG.info('interact offset x = ' + interactOffset.x + ', y = ' + interactOffset.y);
        */

        if (drawRect) {
            return XYRect.fromCenter(
                zoomX >> 0, 
                zoomY >> 0, 
                (drawRect.width * invScaleFactor) >> 0, 
                (drawRect.height * invScaleFactor) >> 0);
        } // if
    } // calcZoomRect
    
    function drawView() {
        var drawLayer,
            rectCenter = XYRect.center(rect),
            rotation = Math.PI,
            ii = 0;
            
        /* first pass clip */
        
        if (canClip) {
            mainContext.beginPath();

            for (ii = layerCount; ii--; ) {
                if (layers[ii].clip) {
                    layers[ii].clip(mainContext, drawRect, drawState, _self, tickCount);
                } // if
            } // for

            mainContext.closePath();
            mainContext.clip();
        } // if
            
        /* second pass - draw */
        
        // reset the view changes
        viewChanges = 0;

        // trigger the draw complete for the view
        triggerAll('drawComplete', rect, tickCount);
    } // drawView
    
    /*
    ### checkHits
    */
    function checkHits() {
        var elements = hitData ? hitData.elements : [],
            ii;
        
        // if we have last hits, then check for elements
        if (lastHitData && lastHitData.type === 'hover') {
            var diffElements = Hits.diffHits(lastHitData.elements, elements);
            
            // if we have diff elements then trigger an out event
            if (diffElements.length > 0) {
                Hits.triggerEvent(lastHitData, _self, 'Out', diffElements);
            } // if
        } // if
        
        // check the hit data
        if (elements.length > 0) {
            var downX = hitData.x,
                downY = hitData.y;
            
            // iterate through objects from last to first (first get drawn last so sit underneath)
            for (ii = elements.length; ii--; ) {
                if (dragStart(elements[ii], downX, downY)) {
                    break;
                } // if
            } // for
            
            Hits.triggerEvent(hitData, _self);
        } // if
        
        // save the last hit elements
        lastHitData = elements.length > 0 ? COG.extend({}, hitData) : null;
    } // checkHits
    
    function cycle(tickCount) {
        // check to see if we are panning
        var redrawBG,
            panning,
            newFrame = false;
            
        // initialise the tick count if it isn't already defined
        // not all browsers pass through the ticks with the requestAnimationFrame :/
        tickCount = tickCount ? tickCount : new Date().getTime();
        
        // set the new frame flag
        newFrame = tickCount - lastCycleTicks > cycleDelay;
        
        // if we have a new frame, then fire the enterFrame event
        if (newFrame) {
            _self.trigger('enterFrame', tickCount, frameIndex++);
            
            // check whether a forced refresh is required
            // TODO: include some state checks here...
            if (tickCount - lastRefresh > minRefresh) {
                refresh();
            } // if
            
            // update the last cycle ticks
            lastCycleTicks = tickCount;
        }
        
        // if we a due for a redraw then do on
        if (newFrame && _self.redraw) {
            // determine if we are panning
            panning = offsetX !== lastOffsetX || offsetY !== lastOffsetY;

            // update the state
            state = stateActive | 
                        (scaleFactor !== 1 ? stateZoom : 0) | 
                        (panning ? statePan : 0) | 
                        (tweeningOffset ? stateAnimating : 0);

            // update the redraw background flags
            redrawBG = (state & (stateZoom | statePan)) !== 0;
            interacting = redrawBG && (state & stateAnimating) === 0;

            /*
            // check that the offset is within bounds
            if (offsetMaxX || offsetMaxY) {
                constrainOffset();
            } // if
            */

            // TODO: if we have a hover offset, check that no elements have moved under the cursor (maybe)

            // prepare the renderer
            if (renderer.prepare(layers, state, tickCount, hitData)) {
                var viewport = renderer.getViewport();
                
                for (var ii = layerCount; ii--; ) {
                    // if a layer is animating the flag as such
                    state = state | (layers[ii].animated ? stateAnimating : 0);

                    // cycle the layer
                    layers[ii].cycle(tickCount, viewport, state);
                } // for

                for (ii = layers.length; ii--; ) {
                    var drawLayer = layers[ii];

                    // determine whether we need to draw
                    if (drawLayer.shouldDraw(state, viewport)) {
                        // if the layer has style, then apply it and save the current style
                        var previousStyle = drawLayer.style ? 
                                renderer.applyStyle(drawLayer.style) : 
                                null;

                        // draw the layer
                        drawLayer.draw(
                            renderer, 
                            state, 
                            _self,
                            tickCount,
                            hitData);

                        // if we applied a style, then restore the previous style if supplied
                        if (previousStyle) {
                            renderer.applyStyle(previousStyle);
                        } // if
                    } // if
                } // for
                
                // get the renderer to render the view
                // NB: some renderers will do absolutely nothing here...
                renderer.render();
            } // if
            
            /*
            // draw the view
            drawView(
                state, 
                cycleRect, 
                clipping && clippable && (! redrawBG), 
                tickCount);
            */

            // check for hits 
            if (hitData) {
                checkHits();
                hitData = null;
            } // if

            // update the last cycle ticks
            lastOffsetX = offsetX;
            lastOffsetY = offsetY;
            _self.redraw = false;
        } // if

        animFrame(cycle);
    } // cycle
    
    function initHitData(hitType, absXY, relXY) {
        // initialise the hit data
        hitData = Hits.init(hitType, absXY, relXY, getScaledOffset(relXY.x, relXY.y, true));
        
        // iterate through the layers and check to see if we have hit potential
        // iterate through all layers as some layers may use the hit guess operation
        // to initialise hit data rather than doing it in the draw loop 
        // (T5.MarkerLayer for instance)
        for (var ii = layerCount; ii--; ) {
            hitFlagged = hitFlagged || (layers[ii].hitGuess ? 
                layers[ii].hitGuess(hitData.x, hitData.y, state, _self) :
                false);
        } // for

        // if we have a potential hit then invalidate the view so a more detailed
        // test can be run
        if (hitFlagged) {
            _self.redraw = true;
        } // if
    } // initHitData
    
    /* exports */
    
    /**
    ### detach
    If you plan on reusing a single canvas element to display different views then you 
    will definitely want to call the detach method between usages.
    */
    function detach() {
        if (eventMonitor) {
            eventMonitor.unbind();
        } // if
    } // detach
    
    /**
    ### eachLayer(callback)
    Iterate through each of the ViewLayers and pass each to the callback function 
    supplied.
    */
    function eachLayer(callback) {
        // iterate through each of the layers and fire the callback for each
        for (var ii = layerCount; ii--; ) {
            callback(layers[ii]);
        } // for
    } // eachLayer
    
    /**
    ### getLayer(id: String): T5.ViewLayer
    Get the ViewLayer with the specified id, return null if not found
    */
    function getLayer(id) {
        // look for the matching layer, and return when found
        for (var ii = 0; ii < layerCount; ii++) {
            if (layers[ii].id === id) {
                return layers[ii];
            } // if
        } // for
        
        return null;
    } // getLayer
    
    /**
    ### getOffset(): T5.XY
    Return a T5.XY containing the current view offset
    */
    function getOffset() {
        // return the last calculated cycle offset
        return XY.init(offsetX, offsetY);
    } // getOffset
    
    /**
    ### getRenderer(): T5.Renderer
    */
    function getRenderer() {
        return renderer;
    } // getRenderer
    
    /**
    ### getScaleFactor(): float
    Return the current scaling factor
    */
    function getScaleFactor() {
        return scaleFactor;
    } // getScaleFactor
    
    /**
    ### getZoomLevel(): int
    Return the current zoom level of the view, for views that do not support
    zooming, this will always return a value of 1
    */
    function getZoomLevel() {
        return zoomLevel;
    }
    
    function invalidate() {
        _self.redraw = true;
    }
    
    /**
    ### setMaxOffset(maxX: int, maxY: int, wrapX: bool, wrapY: bool)
    Set the bounds of the display to the specified area, if wrapX or wrapY parameters
    are set, then the bounds will be wrapped automatically.
    */
    function setMaxOffset(maxX, maxY, wrapX, wrapY) {
        // update the offset bounds
        offsetMaxX = maxX;
        offsetMaxY = maxY;
        
        // update the wrapping flags
        offsetWrapX = typeof wrapX != 'undefined' ? wrapX : false;
        offsetWrapY = typeof wrapY != 'undefined' ? wrapY : false;
    } // setMaxOffset
    
    /**
    ### getViewport(): T5.XYRect
    Return a T5.XYRect for the last drawn view rect
    */
    function getViewport() {
        var viewport, dimensions;
        
        if (renderer) {
            viewport = renderer.getViewport();
            
            if (! viewport) {
                dimensions = renderer.getDimensions();
                viewport = XYRect.init(
                    offsetX, 
                    offsetY, 
                    offsetX + dimensions.width,
                    offsetY + dimensions.height
                );
            }
        } // if
        
        return viewport;
    } // getViewport
    
    /**
    ### pan(x: int, y: int, tweenFn: EasingFn, tweenDuration: int, callback: fn)
    
    Used to pan the view by the specified x and y.  This is simply a wrapper to the 
    updateOffset function that adds the specified x and y to the current view offset.
    Tweening effects can be applied by specifying values for the optional `tweenFn` and
    `tweenDuration` arguments, and if a notification is required once the pan has completed
    then a callback can be supplied as the final argument.
    */
    function pan(x, y, tweenFn, tweenDuration, callback) {
        updateOffset(offsetX + x, offsetY + y, tweenFn, tweenDuration, callback);
    } // pan
    
    /**
    ### setLayer(id: String, value: T5.ViewLayer)
    Either add or update the specified view layer
    */
    function setLayer(id, value) {
        // if the layer already exists, then remove it
        for (var ii = 0; ii < layerCount; ii++) {
            if (layers[ii].id === id) {
                layers.splice(ii, 1);
                break;
            } // if
        } // for
        
        if (value) {
            addLayer(id, value);
            value.trigger('refresh', _self, getViewport());
        } // if

        // invalidate the view
        _self.redraw = true;
        
        // return the layer so we can chain if we want
        return value;
    } // setLayer

    /**
    ### refresh()
    Manually trigger a refresh on the view.  Child view layers will likely be listening for `refresh`
    events and will do some of their recalculations when this is called.
    */
    function refresh() {
        var viewport = renderer ? renderer.getViewport() : null;
        
        if (viewport) {
            // check that the offset is within bounds
            if (offsetMaxX || offsetMaxY) {
                constrainOffset(viewport);
            } // if

            // update the last refresh tick count
            lastRefresh = new Date().getTime();
            triggerAll('refresh', _self, viewport);

            // invalidate
            _self.redraw = true;
        } // if
    } // refresh
    
    /**
    ### removeLayer(id: String)
    Remove the T5.ViewLayer specified by the id
    */
    function removeLayer(id) {
        var layerIndex = getLayerIndex(id);
        if ((layerIndex >= 0) && (layerIndex < layerCount)) {
            _self.trigger('layerRemoved', layers[layerIndex]);

            layers.splice(layerIndex, 1);
            _self.redraw = true;
        } // if
        
        // update the layer count
        layerCount = layers.length;
    } // removeLayer
    
    function resetScale() {
        scaleFactor = 1;
    } // resetScale
    
    /**
    ### scale(targetScaling: float, targetXY: T5.XY, tweenFn: EasingFn, callback: fn)
    Scale the view to the specified `targetScaling` (1 = normal, 2 = double-size and 0.5 = half-size).
    */
    function scale(targetScaling, targetXY, tweenFn, callback, duration) {
        // if tweening then update the targetXY
        if (tweenFn) {
            COG.tweenValue(scaleFactor, targetScaling, tweenFn, duration, function(val, completed) {
                // update the scale factor
                scaleFactor = val;
                
                if (completed) {
                    var scaleFactorExp = round(log(scaleFactor) / Math.LN2);

                    // round the scale factor to the nearest power of 2
                    scaleFactor = pow(2, scaleFactorExp);

                    // if we have a callback to complete, then call it
                    if (callback) {
                        callback();
                    } // if
                } // if

                // trigger the on animate handler
                setZoomCenter(targetXY);
                scaleView();
            });
        }
        // otherwise, update the scale factor and fire the callback
        else {
            scaleFactor = targetScaling;
            
            // update the zoom center
            setZoomCenter(targetXY);
            scaleView();
        }  // if..else        

        return _self;
    } // scale
    
    /**
    ### setZoomLevel(value: int, zoomXY: T5.XY): boolean
    This function is used to update the zoom level of the view.  The zoom level 
    is checked to ensure that it falls within the `minZoom` and `maxZoom` values.  Then
    if the requested zoom level is different from the current the zoom level is updated
    and a `zoomLevelChange` event is triggered
    */
    function setZoomLevel(value, zoomX, zoomY) {
        value = max(params.minZoom, min(params.maxZoom, value));
        if (value !== zoomLevel) {
            var scaling = pow(2, value - zoomLevel),
                scaledHalfWidth = halfWidth / scaling | 0,
                scaledHalfHeight = halfHeight / scaling | 0;
            
            // update the zoom level
            zoomLevel = value;
            
            // update the offset
            updateOffset(
                ((zoomX ? zoomX : offsetX + halfWidth) - scaledHalfWidth) * scaling,
                ((zoomY ? zoomY : offsetY + halfHeight) - scaledHalfHeight) * scaling
            );
            
            // reset the last offset
            lastOffsetX = offsetX;
            lastOffsetY = offsetY;

            // trigger the change
            triggerAll('zoomLevelChange', value);
            
            // reset the scale factor
            scaleFactor = 1;
            
            // refresh the display
            refresh();
            _self.redraw = true;
        } // if
    } // setZoomLevel
    
    /**
    ### syncXY(points, reverse)
    This function is used to keep a T5.XY derivative x and y position in sync
    with it's real world location (if it has one).  T5.GeoXY are a good example 
    of this.
    
    If the `reverse` argument is specified and true, then the virtual world 
    coordinate will be updated to match the current x and y offsets.
    */
    function syncXY(points, reverse) {
    } // syncXY
    
    /**
    ### triggerAll(eventName: string, args*)
    Trigger an event on the view and all layers currently contained in the view
    */
    function triggerAll() {
        var cancel = _self.trigger.apply(null, arguments).cancel;
        for (var ii = layers.length; ii--; ) {
            cancel = layers[ii].trigger.apply(null, arguments).cancel || cancel;
        } // for
        
        return (! cancel);
    } // triggerAll
    
    
    /**
    ### updateOffset(x: int, y: int, tweenFn: EasingFn, tweenDuration: int, callback: fn)

    This function allows you to specified the absolute x and y offset that should 
    become the top-left corner of the view.  As per the `pan` function documentation, tween and
    callback arguments can be supplied to animate the transition.
    */
    function updateOffset(x, y, tweenFn, tweenDuration, callback) {
        
        // initialise variables
        var tweensComplete = 0,
            minXYOffset = layerMinXY ? XY.offset(layerMinXY, -halfWidth, -halfHeight) : null,
            maxXYOffset = layerMaxXY ? XY.offset(layerMaxXY, -halfWidth, -halfHeight) : null;
        
        function endTween() {
            tweensComplete += 1;
            
            if (tweensComplete >= 2) {
                tweeningOffset = false;
                
                if (callback) {
                    callback();
                } // if
            } // if
        } // endOffsetUpdate
        
        // check that the x and y values are within acceptable bounds
        if (minXYOffset) {
            x = x < minXYOffset.x ? minXYOffset.x : x;
            y = y < minXYOffset.y ? minXYOffset.y : y;
        } // if
        
        if (maxXYOffset) {
            x = x > maxXYOffset.x ? maxXYOffset.x : x;
            y = y > maxXYOffset.y ? maxXYOffset.y : y;
        } // if
        
        if (tweenFn) {
            // if the interface is already being move about, then don't set up additional
            // tweens, that will just ruin it for everybody
            if ((state & statePan) !== 0) {
                return;
            } // if
            
            COG.tweenValue(offsetX, x, tweenFn, tweenDuration, function(val, complete){
                offsetX = val | 0;
                
                (complete ? endTween : invalidate)();
                return !interacting;
            });
            
            COG.tweenValue(offsetY, y, tweenFn, tweenDuration, function(val, complete) {
                offsetY = val | 0;

                (complete ? endTween : invalidate)();
                return !interacting;
            });
            
            tweeningOffset = true;
        }
        else {
            offsetX = x | 0;
            offsetY = y | 0;
            
            // invalidate the display
            _self.redraw = true;
            
            // trigger the callback
            if (callback) {
                callback();
            } // if
        } // if..else
    } // updateOffset
    
    function triggerAllUntilCancelled() {
        var cancel = _self.trigger.apply(null, arguments).cancel;
        for (var ii = layers.length; ii--; ) {
            cancel = layers[ii].trigger.apply(null, arguments).cancel || cancel;
        } // for
        
        return (! cancel);
    } // triggerAllUntilCancelled
    
    /* object definition */
    
    // initialise _self
    var _self = {
        id: params.id,
        deviceScaling: deviceScaling,
        fastDraw: params.fastDraw || getConfig().requireFastDraw,
        
        detach: detach,
        eachLayer: eachLayer,
        getLayer: getLayer,
        getZoomLevel: getZoomLevel,
        setLayer: setLayer,
        invalidate: invalidate,
        refresh: refresh,
        resetScale: resetScale,
        scale: scale,
        setZoomLevel: setZoomLevel,
        syncXY: syncXY,
        triggerAll: triggerAll,
        removeLayer: removeLayer,
        
        /* offset methods */
        
        getOffset: getOffset,
        getRenderer: getRenderer,
        getScaleFactor: getScaleFactor,
        setMaxOffset: setMaxOffset,
        getViewport: getViewport,
        updateOffset: updateOffset,
        pan: pan
    };

    deviceScaling = getConfig().getScaling();
    
    // make the view observable
    COG.observable(_self);
    
    // handle the view being resynced
    _self.bind('resync', handleResync);
    
    // make the view configurable
    COG.configurable(
        _self, [
            'container',
            'captureHover',
            'captureDrag', 
            'scalable', 
            'pannable', 
            'inertia',
            'minZoom', 
            'maxZoom',
            'zoom'
        ], 
        COG.paramTweaker(params, null, {
            'container': handleContainerUpdate,
            'inertia': captureInteractionEvents,
            'captureHover': captureInteractionEvents,
            'scalable': captureInteractionEvents,
            'pannable': captureInteractionEvents
        }),
        true);

    CANI.init(function(testResults) {
        // add the markers layer
        _self.markers = addLayer('markers', new ShapeLayer({
            zindex: 20
        }));
        
        // create the renderer
        caps = testResults;
        createRenderer();

        /*
        // store the results for reference
        canvasCaps = testResults.canvas;
        
        // attach the map to the canvas
        attachToCanvas();
        */
    
        // if autosized, then listen for resize events
        if (isIE) {
            window.attachEvent('onresize', handleResize);
        }
        else {
            window.addEventListener('resize', handleResize, false);
        }
    });
    
    // start the animation frame
    animFrame(cycle);

    return _self;
}; // T5.View

