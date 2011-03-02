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

- `zoomEasing` - (easing, default = `quad.out`) - The easing effect that should be used when 
the user double taps the display to zoom in on the view.

- `zoomDuration` - (int, default = 300) - If the `zoomEasing` parameter is specified then 
this is the duration for the tween.


## Events

### scale
This event is fired when the view has been scaled.
<pre>
view.bind('scale', function(evt, scaleFactor, scaleXY) {
});
</pre>

- scaleFactor (Float) - the amount the view has been scaled by.
When the view is being scaled down this will be a value less than
1 and when it is being scaled up it will be greater than 1.
- scaleXY (T5.Vector) - the relative position on the view where
the scaling operation is centered.


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

### resize
This event is fired when the view has been resized (either manually or
automatically).
<pre>
view.bind('resize', function(evt, width, height) {

});
</pre>

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


## Methods
*/
var View = function(params) {
    // initialise defaults
    params = COG.extend({
        id: COG.objId('view'),
        container: "",
        captureHover: true,
        fastDraw: false,
        inertia: true,
        idleDelay: 100,
        minRefresh: 1000,
        pannable: true,
        clipping: true,
        scalable: true,
        panAnimationEasing: COG.easing('sine.out'),
        panAnimationDuration: 750,
        pinchZoomAnimateTrigger: 400,
        autoSize: true,
        tapExtent: 10,
        guides: false,
        fps: 25,
        zoomEasing: COG.easing('quad.out'),
        zoomDuration: 300
    }, params);
    
    // get the container context
    var layers = [],
        layerCount = 0,
        canvas = document.getElementById(params.container),
        mainContext = null,
        isIE = typeof window.attachEvent != 'undefined',
        idleDelay = params.idleDelay,
        minRefresh = params.minRefresh,
        hoverOffset = null,
        offsetX = 0,
        offsetY = 0,
        offsetMaxX = null,
        offsetMaxY = null,
        offsetWrapX = false,
        offsetWrapY = false,
        clipping = params.clipping,
        cycleRect = null,
        cycling = false,
        drawRect,
        guides = params.guides,
        deviceScaling = 1,
        wakeTriggers = 0,
        halfWidth = 0,
        halfHeight = 0,
        interactOffset = null,
        interactCenter = null,
        interacting = false,
        idle = false,
        idleTimeout = 0,
        panEndTimeout = 0,
        layerMinXY = null,
        layerMaxXY = null,
        lastRefresh = 0,
        rotation = 0,
        resizeCanvasTimeout = 0,
        scaleFactor = 1,
        scaleTween = null,
        lastScaleFactor = 0,
        lastCycleTicks = 0,
        sizeChanged = false,
        eventMonitor = null,
        viewHeight,
        viewWidth,
        isFlash = typeof FlashCanvas !== 'undefined',
        cycleDelay = 1000 / params.fps | 0,
        viewChanges = 0,
        zoomX, zoomY,
        
        /* state shortcuts */
        
        stateActive = viewState('ACTIVE'),
        statePan = viewState('PAN'),
        stateZoom = viewState('ZOOM'),
        stateAnimating = viewState('ANIMATING'),
        
        state = stateActive;
        
    /* event handlers */
    
    function handlePan(evt, x, y, inertia) {
        state = statePan;
        
        updateOffset(
            offsetX - x, 
            offsetY - y,
            inertia ? params.panAnimationEasing : null,
            inertia ? params.panAnimationDuration : null);
        
        clearTimeout(panEndTimeout);
        panEndTimeout = setTimeout(panEnd, 100);
    } // pan
    
    /* scaling functions */
    
    function panEnd() {
        state = stateActive;
        invalidate();
    } // panEnd
    
    function handleZoom(evt, absXY, relXY, scaleChange, source) {
        scale(min(max(scaleFactor + pow(2, scaleChange) - 1, 0.5), 2));
    } // handleWheelZoom
    
    function scaleView() {
        var scaleFactorExp = (log(scaleFactor) / Math.LN2) >> 0;
        
        // COG.info('scale factor = ' + scaleFactor + ', exp = ' + scaleFactorExp);
        if (scaleFactorExp !== 0) {
            scaleFactor = pow(2, scaleFactorExp);
            
            var scaledHalfWidth = (halfWidth / scaleFactor) >> 0,
                scaledHalfHeight = (halfHeight / scaleFactor) >> 0,
                scaleEndXY = XY.init(zoomX - scaledHalfWidth, zoomY - scaledHalfHeight);
            
            /*
            COG.info('zoom x = ' + zoomX + ', y = ' + zoomY);
            COG.info('cycleRect width = ' + cycleRect.width);
            COG.info('drawRect width = ' + drawRect.width);
            COG.info('scaled half width = ' + scaledHalfWidth + ', height = ' + scaledHalfHeight);
            COG.info('scaled end x = ' + scaleEndXY.x + ', y = ' + scaleEndXY.y);
            */

            // trigger the scale
            if (! self.trigger('scale', scaleFactor, scaleEndXY).cancel) {
                // COG.info('ok to scale');
                
                // flag to the layers that we are scaling
                for (var ii = layers.length; ii--; ) {
                    layers[ii].trigger('scale', scaleFactor, scaleEndXY);
                } // for

                // flag scaling as false
                scaleFactor = 1;
                state = stateActive;
            } // if
            
            // refresh the display
            // TODO: check whether this should be triggered elsewhere
            refresh();
        } // if

        // invalidate the view
        invalidate();
    } // scaleView
    
    function setZoomCenter(xy) {
        // if the xy is not defined, then use canvas center
        if (! xy) {
            xy = XY.init(halfWidth, halfHeight);
        } // if
        
        interactOffset = XY.init(offsetX, offsetY);
        interactCenter = XY.offset(xy, offsetX, offsetY);
        
        // initialise the zoom x and y to the interact center initially
        zoomX = interactCenter.x;
        zoomY = interactCenter.y;
        
        // COG.info('interact offset, x = ' + interactOffset.x + ', y = ' + interactOffset.y);
        // COG.info('interact center, x = ' + interactCenter.x + ', y = ' + interactCenter.y);
    } // setZoomCenter
    
    function getScaledOffset(srcX, srcY) {
        var scaledX, scaledY,
            invScaleFactor = 1 / scaleFactor;
            
        if (scaleFactor !== 1 && drawRect) {
            scaledX = drawRect.x1 + srcX * invScaleFactor;
            scaledY = drawRect.y1 + srcY * invScaleFactor;
        }
        else {
            scaledX = srcX + offsetX;
            scaledY = srcY + offsetY;
        } // if..else
        
        return XY.init(scaledX, scaledY);        
    } // getScaledOffset
    
    function handleContainerUpdate(name, value) {
        canvas = document.getElementById(value);
        
        // attach to the new canvas
        attachToCanvas();
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
        hoverOffset = null;
        hitTest(absXY, relXY, getScaledOffset(relXY.x, relXY.y), 'down');
    } // handlePointerDown
    
    function handlePointerHover(evt, absXY, relXY) {
        hoverOffset = getScaledOffset(relXY.x, relXY.y);
        // COG.info('relxy = ' + T5.XY.toString(relXY) + ', hover offset = ' + T5.XY.toString(hoverOffset));
        hitTest(absXY, relXY, hoverOffset, 'hover');
    } // handlePointerHover
    
    function handleResize(evt) {
        clearTimeout(resizeCanvasTimeout);
        resizeCanvasTimeout = setTimeout(attachToCanvas, 250);
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
        hitTest(absXY, relXY, getScaledOffset(relXY.x, relXY.y), 'tap');

        triggerAll(
            'tap', 
            absXY,
            relXY,
            getScaledOffset(relXY.x, relXY.y)
        );
    } // handlePointerTap
    
    function hitTest(absXY, relXY, offsetXY, eventType) {
        var hitElements = [];
        
        // iterate through the layers and check for elements under the cursor
        for (var ii = layerCount; ii--; ) {
            if (layers[ii].hitTest) {
                hitElements = hitElements.concat(layers[ii].hitTest(
                                                    offsetXY.x, 
                                                    offsetXY.y, 
                                                    state, 
                                                    self));
            } // if
        } // for
        
        if (hitElements.length > 0) {
            self.triggerCustom(
                eventType + 'Hit', {
                    hitType: eventType
                },
                hitElements, 
                absXY, 
                relXY, 
                offsetXY);
        } // if
    } // hitTest
    
    /* private functions */
    
    function attachToCanvas(newWidth, newHeight) {
        var ii;
        
        if (canvas) {
            // if we are autosizing the set the size
            if (params.autoSize && canvas.parentNode) {
                newWidth = canvas.parentNode.offsetWidth;
                newHeight = canvas.parentNode.offsetHeight;
            } // if

            try {
                // ensure that the canvas has an id, as the styles reference it
                if (! canvas.id) {
                    canvas.id = params.id + '_canvas';
                } // if

                // get the canvas context
                mainContext = canvas.getContext('2d');
            } 
            catch (e) {
                COG.exception(e);
                throw new Error("Could not initialise canvas on specified view element");
            }
            
            // initialise the views width and height
            if ((newWidth && newHeight) && (viewHeight !== newHeight || viewWidth !== newWidth)) {
                // flag the size as changed
                sizeChanged = true;
                
                // initialise the width and height locals
                viewWidth = newWidth;
                viewHeight = newHeight;
                halfWidth = viewWidth >> 1;
                halfHeight = viewHeight >> 1;
                
                // trigger the resize event for the view
                self.trigger('resize', viewWidth, viewHeight);
                
                // and then tell all the layers
                for (ii = layerCount; ii--; ) {
                    layers[ii].trigger('resize', viewWidth, viewHeight);
                } // for
            } // if
            
            // iterate through the layers, and change the context
            for (ii = layerCount; ii--; ) {
                layerContextChanged(layers[ii]);
            } // for

            // invalidate the canvas
            invalidate();
            
            // attach interaction handlers
            captureInteractionEvents();
        } // if        
    } // attachToCanvas
    
    function addLayer(id, value) {
        // make sure the layer has the correct id
        value.setId(id);
        value.added = ticks();
        
        // bind to the remove event
        value.bind('remove', function() {
            self.removeLayer(id);
        });
        
        layerContextChanged(value);
        
        // tell the layer that I'm going to take care of it
        value.setParent(self);
        
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

        // recreate the event monitor
        eventMonitor = INTERACT.watch(canvas);
        
        // if this is pannable, then attach event handlers
        if (params.pannable) {
            eventMonitor.pannable().bind('pan', handlePan);
        } // if

        // if this view is scalable, attach zooming event handlers
        if (params.scalable) {
            eventMonitor.bind('zoom', handleZoom);
            eventMonitor.bind('doubleTap', handleDoubleTap);
        } // if
        
        if (params.captureHover) {
            eventMonitor.bind('pointerDown', handlePointerDown);
            eventMonitor.bind('pointerHover', handlePointerHover);
        } // if

        // handle tap events
        eventMonitor.bind('tap', handlePointerTap);
    } // captureInteractionEvents
    
    /*
    The constrain offset function is used to keep the view offset within a specified
    offset using wrapping if allowed.  The function is much more 'if / then / elsey' 
    than I would like, and might be optimized at some stage, but it does what it needs to
    */
    function constrainOffset() {
        var testX = offsetWrapX ? offsetX + halfWidth : offsetX,
            testY = offsetWrapY ? offsetY + halfHeight : offsetY;
        
        // check the x
        if (offsetMaxX && offsetMaxX > viewWidth) {
            if (testX + viewWidth > offsetMaxX) {
                if (offsetWrapX) {
                    offsetX = testX - offsetMaxX > 0 ? offsetX - offsetMaxX : offsetX;
                }
                else {
                    offsetX = offsetMaxX - viewWidth;
                } // if..else
            }
            else if (testX < 0) {
                offsetX = offsetWrapX ? offsetX + offsetMaxX : 0;
            } // if..else
        } // if
        
        // check the y
        if (offsetMaxY && offsetMaxY > viewHeight) {
            if (testY + viewHeight > offsetMaxY) {
                if (offsetWrapY) {
                    offsetY = testY - offsetMaxY > 0 ? offsetY - offsetMaxY : offsetY;
                }
                else {
                    offsetY = offsetMaxY - viewHeight;
                } // if..else
            }
            else if (testY < 0) {
                offsetY = offsetWrapY ? offsetY + offsetMaxY : 0;
            } // if..else
        } // if
    } // constrainOffset
    
    function getLayerIndex(id) {
        for (var ii = layerCount; ii--; ) {
            if (layers[ii].getId() == id) {
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
    
    function drawView(drawState, rect, canClip, tickCount) {
        var drawLayer,
            rectCenter = XYRect.center(rect),
            ii = 0;
            
        // update the draw rect
        drawRect = XYRect.copy(rect);
        
        // include the scale factor information in the draw rect
        drawRect.scaleFactor = scaleFactor;
            
        // fill the mask context with black
        if (! canClip) {
            mainContext.clearRect(0, 0, viewWidth, viewHeight);
        } // if

        // save the context states
        mainContext.save();
        // COG.info('offsetX = ' + offsetX + ', offsetY = ', offsetY + ', drawing rect = ', rect);
        
        try {
            // initialise the composite operation
            mainContext.globalCompositeOperation = 'source-over';
            
            if (scaleFactor !== 1) {
                drawRect = calcZoomRect(drawRect);
                mainContext.scale(scaleFactor, scaleFactor);
            } // if

            // translate the display appropriately
            mainContext.translate(-drawRect.x1, -drawRect.y1);
            
            // reset the layer bounds
            layerMinXY = null;
            layerMaxXY = null;
            
            /* first pass - clip */

            if (canClip) {
                mainContext.beginPath();

                for (ii = layerCount; ii--; ) {
                    if (layers[ii].clip) {
                        layers[ii].clip(mainContext, drawRect, drawState, self, tickCount);
                    } // if
                } // for

                mainContext.closePath();
                mainContext.clip();
            } // if
            
            /* second pass - draw */
            
            for (ii = layerCount; ii--; ) {
                drawLayer = layers[ii];
                
                // if the layer has style, then apply it and save the current style
                var layerStyle = drawLayer.style,
                    previousStyle = layerStyle ? Style.apply(mainContext, layerStyle) : null;

                // if the layer has bounds, then update the layer bounds
                if (drawLayer.minXY) {
                    layerMinXY = layerMinXY ? 
                        XY.min(layerMinXY, drawLayer.minXY) : 
                        XY.copy(drawLayer.minXY);
                } // if

                if (drawLayer.maxXY) {
                    layerMaxXY = layerMaxXY ? 
                        XY.max(layerMaxXY, drawLayer.maxXY) :
                        XY.copy(drawLayer.maxXY);
                } // if

                // draw the layer
                drawLayer.draw(
                    mainContext, 
                    drawRect, 
                    drawState, 
                    self,
                    tickCount);

                // if we applied a style, then restore the previous style if supplied
                if (previousStyle) {
                    Style.apply(mainContext, previousStyle);
                } // if
            } // for

            //= debug:require "debug/offsetbounds"
        }
        finally {
            mainContext.restore();
        } // try..finally
        
        
        if (guides) {
            mainContext.globalCompositeOperation = 'source-over';
            mainContext.strokeStyle = '#f00';
            mainContext.beginPath();
            mainContext.moveTo(halfWidth, 0);
            mainContext.lineTo(halfWidth, viewHeight);
            mainContext.moveTo(0, halfHeight);
            mainContext.lineTo(viewWidth, halfHeight);
            mainContext.stroke();
        } // if

        // reset the view changes
        viewChanges = 0;

        // trigger the draw complete for the view
        triggerAll('drawComplete', rect, tickCount);
    } // drawView
    
    function cycle(tickCount) {
        // check to see if we are panning
        var redrawBG,
            clippable = false,
            layerArgs = {};
            
        if (! viewChanges) {
            cycling = false;
            return;
        }
            
        if (tickCount - lastCycleTicks > cycleDelay) {

            // if the scale factor is !== 1 then set the state to zoom
            if (scaleFactor !== 1) {
                state = state | stateZoom;
            } // if

            // update the redraw background flags
            redrawBG = (state & (stateZoom | statePan)) !== 0;
            interacting = redrawBG && (state & stateAnimating) === 0;

            // handle any size changes if we have them
            if (sizeChanged && canvas) {
                if (typeof FlashCanvas != 'undefined') {
                    FlashCanvas.initElement(canvas);
                } // if

                // update the canvas width
                canvas.width = viewWidth;
                canvas.height = viewHeight;

                canvas.style.width = viewWidth + 'px';
                canvas.style.height = viewHeight + 'px';

                // flag the size is not changed now as we have handled the update
                sizeChanged = false;
            } // if

            // check that the offset is within bounds
            if (offsetMaxX || offsetMaxY) {
                constrainOffset();
            } // if

            // calculate the cycle rect
            cycleRect = getViewRect();

            if (interacting) {
                idle = false;
                if (idleTimeout !== 0) {
                    clearTimeout(idleTimeout);
                    idleTimeout = 0;
                } // if
            }  // if
            
            // TODO: if we have a hover offset, check that no elements have moved under the cursor (maybe)

            for (var ii = layerCount; ii--; ) {
                if (layers[ii].animated) {
                    // add the animating state to the current state
                    state = state | stateAnimating;
                } // if

                // cycle the layer
                layers[ii].cycle(tickCount, cycleRect, state);

                // determine whether we need to draw
                layers[ii].shouldDraw(state, cycleRect);

                // then determine if we have a clippable layer
                clippable = layers[ii].clip || clippable;
            } // for

            // draw the view
            drawView(state, cycleRect, clipping && clippable && (! redrawBG), tickCount);

            // check whether a forced refresh is required
            // TODO: include some state checks here...
            if (tickCount - lastRefresh > minRefresh) {
                refresh();
            } // if
            
            // update the last cycle ticks
            lastCycleTicks = tickCount;
        } // if

        animFrame(cycle);
    } // cycle
    
    function layerContextChanged(layer) {
        layer.trigger("contextChanged", mainContext);
    } // layerContextChanged
    
    /* exports */
    
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
    
    function invalidate() {
        viewChanges += 1;
        
        if (! cycling) {
            cycling = true;
            animFrame(cycle);
        } // if
    } // invalidate
    
    /**
    ### getDimensions(): T5.Dimensions
    Return the Dimensions of the View
    */
    function getDimensions() {
        return Dimensions.init(viewWidth, viewHeight);
    } // getDimensions
    
    /**
    ### getLayer(id: String): T5.ViewLayer
    Get the ViewLayer with the specified id, return null if not found
    */
    function getLayer(id) {
        // look for the matching layer, and return when found
        for (var ii = 0; ii < layerCount; ii++) {
            if (layers[ii].getId() == id) {
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
    ### getViewRect(): T5.XYRect
    Return a T5.XYRect for the last drawn view rect
    */
    function getViewRect() {
        return XYRect.init(
            offsetX, 
            offsetY, 
            offsetX + viewWidth,
            offsetY + viewHeight);
    } // getViewRect
    
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
            if (layers[ii].getId() === id) {
                layers.splice(ii, 1);
                break;
            } // if
        } // for
        
        if (value) {
            addLayer(id, value);
            value.trigger('refresh', self, getViewRect());
        } // if

        // invalidate the view
        invalidate();
        
        // return the layer so we can chain if we want
        return value;
    } // setLayer

    /**
    ### refresh()
    Manually trigger a refresh on the view.  Child view layers will likely be listening for `refresh`
    events and will do some of their recalculations when this is called.
    */
    function refresh() {
        // update the last refresh tick count
        lastRefresh = new Date().getTime();
        triggerAll('refresh', self, getViewRect());
        
        // invalidate
        invalidate();
    } // refresh
    
    /**
    ### removeLayer(id: String)
    Remove the T5.ViewLayer specified by the id
    */
    function removeLayer(id) {
        var layerIndex = getLayerIndex(id);
        if ((layerIndex >= 0) && (layerIndex < layerCount)) {
            self.trigger('layerRemoved', layers[layerIndex]);

            layers.splice(layerIndex, 1);
            invalidate();
        } // if
        
        // update the layer count
        layerCount = layers.length;
    } // removeLayer
    
    function resetScale() {
        scaleFactor = 1;
    } // resetScale
    
    /**
    ### resize(width: Int, height: Int)
    Perform a manual resize of the canvas associated with the view.  If the 
    view was originally marked as `autosize` this will override that instruction.
    */
    function resize(width, height) {
        // if the canvas is assigned, then update the height and width and reattach
        if (canvas) {
            // flag the canvas as not autosize
            params.autoSize = false;
            
            if (viewWidth !== width || viewHeight !== height) {
                attachToCanvas(width, height);
            } // if
        } // if
    } // resize
    
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

        return self;
    } // scale
    
    /**
    ### triggerAll(eventName: string, args*)
    Trigger an event on the view and all layers currently contained in the view
    */
    function triggerAll() {
        var cancel = self.trigger.apply(null, arguments).cancel;
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
                panEnd();
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
            
            // update the state to pan and animating
            state = statePan | stateAnimating;
        }
        else {
            offsetX = x | 0;
            offsetY = y | 0;
            
            // invalidate the display
            invalidate();
            
            // trigger the callback
            if (callback) {
                callback();
            } // if
        } // if..else
    } // updateOffset
    
    function triggerAllUntilCancelled() {
        var cancel = self.trigger.apply(null, arguments).cancel;
        for (var ii = layers.length; ii--; ) {
            cancel = layers[ii].trigger.apply(null, arguments).cancel || cancel;
        } // for
        
        return (! cancel);
    } // triggerAllUntilCancelled
    
    /* object definition */
    
    // initialise self
    var self = {
        id: params.id,
        deviceScaling: deviceScaling,
        fastDraw: params.fastDraw || getConfig().requireFastDraw,
        
        getDimensions: getDimensions,
        getLayer: getLayer,
        setLayer: setLayer,
        eachLayer: eachLayer,
        invalidate: invalidate,
        refresh: refresh,
        resetScale: resetScale,
        resize: resize,
        scale: scale,
        triggerAll: triggerAll,
        removeLayer: removeLayer,
        
        /* offset methods */
        
        getOffset: getOffset,
        setMaxOffset: setMaxOffset,
        getViewRect: getViewRect,
        updateOffset: updateOffset,
        pan: pan
    };

    deviceScaling = getConfig().getScaling();
    
    // add the markers layer
    self.markers = addLayer('markers', new MarkerLayer());
    
    // make the view observable
    COG.observable(self);
    
    // listen for being woken up
    self.bind('invalidate', function(evt) {
        invalidate();
    });
    
    // handle the view being resynced
    self.bind('resync', handleResync);
    
    // make the view configurable
    COG.configurable(
        self, 
        ["inertia", "container", 'rotation', 'tapExtent', 'scalable', 'pannable'], 
        COG.paramTweaker(params, null, {
            "container": handleContainerUpdate,
            'rotation':  handleRotationUpdate,
            'scalable':  captureInteractionEvents,
            'pannable':  captureInteractionEvents
        }),
        true);
    
    // attach the map to the canvas
    attachToCanvas();
    
    // if autosized, then listen for resize events
    if (params.autoSize) {
        if (isIE) {
            window.attachEvent('onresize', handleResize);
        }
        else {
            window.addEventListener('resize', handleResize, false);
        }
    } // if

    return self;
}; // T5.View

