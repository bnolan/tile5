var Line = function(points, params) {
    params.fill = false;
    
    Poly.call(this, points, params);
};

Line.prototype = new Poly();