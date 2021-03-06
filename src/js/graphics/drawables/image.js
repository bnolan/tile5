/**
# T5.ImageDrawable
_extends:_ T5.Drawable


An image annotation is simply a T5.Annotation that has been extended to 
display an image rather than a simple circle.  Probably the most common type
of annotation used.  Supports using either the `image` or `imageUrl` parameters
to use preloaded or an imageurl for displaying the annotation.

## TODO

- currently hits on animated markers not working as well as they should, need to 
tweak touch handling to get this better...


## Constructor
`new T5.Image(params);`

### Initialization Parameters

- `image` (HTMLImage, default = null) - one of either this or the `imageUrl` parameter
is required and the specified image is used to display the annotation.

- `imageUrl` (String, default = null) - one of either this of the `image` parameter is
required.  If specified, the image is obtained using T5.Images module and then drawn
to the canvas.

- `imageAnchor` (T5.Vector, default = null) - a T5.Vector that optionally specifies the 
anchor position for an annotation.  Consider that your annotation is "pin-like" then you
would want to provide an anchor vector that specified the pixel position in the image 
around the center and base of the image.  If not `imageAnchor` parameter is provided, then 
the center of the image is assumed for the anchor position.

- `rotation` (float, default = 0) - the value of the rotation for the image marker 
(in radians).  Be aware that applying rotation to a marker does add an extra processing
overhead as the canvas context needs to be saved and restored as part of the operation.

- `scale` (float, default = 1)

- `opacity` (float, default = 1)


## Methods
*/
var ImageDrawable = function(params) {
    params = COG.extend({
        image: null,
        imageUrl: null,
        imageOffset: null
    }, params);
    
    var dragOffset = null,
        drawableUpdateBounds = Drawable.prototype.updateBounds,
        drawX,
        drawY,
        image = params.image;
            
    /* exports */
    
    function changeImage(imageUrl) {
        // update the image url
        this.imageUrl = imageUrl;
        
        // load the new image
        if (this.imageUrl) {
            getImage(this.imageUrl, function(retrievedImage, loaded) {
                image = retrievedImage;
                
                if (loaded) {
                    var view = _self.layer ? _self.layer.getParent() : null;

                    // invalidate the view
                    if (view) {
                        view.invalidate();
                    } // if
                } // if
            });
        } // if
    } // changeImage
    
    /**
    ### drag(dragData, dragX, dragY, drop)
    */
    function drag(dragData, dragX, dragY, drop) {
        // if the drag offset is unknown then calculate
        if (! dragOffset) {
            dragOffset = XY.init(
                dragData.startX - this.xy.x, 
                dragData.startY - this.xy.y
            );

            // TODO: increase scale? to highlight dragging
        }

        // update the xy and accounting for a drag offset
        this.xy.x = dragX - dragOffset.x;
        this.xy.y = dragY - dragOffset.y;
        
        if (drop) {
            dragOffset = null;
            
            // TODO: reset scale
            
            if (this.layer) {
                var view = this.layer.getParent();
                if (view) {
                    view.syncXY([this.xy], true);
                } // if
            } // if
            
            this.trigger('dragDrop');
        } // if
        
        return true;
    } // drag    
    
    /**
    ### draw(context, x, y, width, height, state)
    */
    function draw(context, offsetX, offsetY, width, height, state) {
        context.drawImage(image, drawX, drawY);
    } // draw
    
    /**
    ### prepPath(context, offsetX, offsetY, width, height, state, hitData)
    Prepare the path that will draw the polygon to the canvas
    */
    function prepPath(context, offsetX, offsetY, width, height, state) {
        // get the image
        var draw = image && image.width > 0;
            
        if (draw) {
            checkOffsetAndBounds(this, image);
            
            // update the draw x and y
            drawX = this.xy.x + this.imageOffset.x - offsetX;
            drawY = this.xy.y + this.imageOffset.y - offsetY;
            
            // open the path for hit tests
            context.beginPath();
            context.rect(drawX, drawY, image.width, image.height);
        } // if
        
        return draw;
    } // prepPath 
    
    /**
    ### updateBounds(bounds: XYRect, updateXY: boolean)
    */
    function updateBounds(bounds, updateXY) {
        drawableUpdateBounds.call(this, bounds, updateXY);

        // check the offset and bounds
        checkOffsetAndBounds(this, image);
    } // setOrigin
    
    // call the inherited constructor
    Drawable.call(this, params);
    
    var _self = COG.extend(this, {
        changeImage: changeImage,
        drag: drag,
        draw: draw,
        prepPath: prepPath,
        updateBounds: updateBounds
    });

    // load the appropriate image
    if (! image) { 
        changeImage(this.imageUrl);
    } // if
};

ImageDrawable.prototype = new Drawable();
ImageDrawable.prototype.constructor = ImageDrawable;
