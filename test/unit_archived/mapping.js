(function() {
    var mappingTestData = {
        zoomLevel: 7,
        positions: {
            rocky: new T5.Geo.Position("-23.391737 150.503082"),
            goldcoast: new T5.Geo.Position("-28.032099 153.434587"),
            brisbane: new T5.Geo.Position("-27.4688793718815 153.02282050252"),
            sydney: new T5.Geo.Position("-33.8696305453777 151.206959635019"),
            mudgee: new T5.Geo.Position("-32.5993604958057 149.587680548429"),
            toowoomba: new T5.Geo.Position("-27.5614504516125 151.953289657831")
        },
        addresses: [
            "2649 LOGAN ROAD, EIGHT MILE PLAINS, QLD",
            "49 ROSE LANE, GORDON PARK, QLD", 
            "BRISBANE AIRPORT",
            "BRISBANE INTERNATIONAL AIRPORT",
            "HOLLAND PARK", 
            "BOTANIC GARDENS",
            "CENTRAL STATION, BRISBANE", 
            "QUEENS PARK",
            "DIDDILLIBAH", 
            "ROCKHAMPTON",
            "NORMANTON, QLD",
            "MT WARREN PARK",
            "BALD HILLS",
            "CROWS NEST",
            "MANSFIELD, QLD",
            "BELMONT, QLD",
            "PERTH, QLD",
            "PERTH",
            "BIRDSVILLE",
            "VICTORIA POINT",
            "132 BUCKINGHAMIA PLACE, STRETTON, QLD",
            "MT TAMBORINE",
            "SUNRISE BEACH",
            "HYATT REGENCY COOLUM BEACH",
            "BELLBIRD PARK"
        ]
    };
    
    function geocodeTestAddresses(engine, addressIndex, listCompleteCallback) {
        if ((addressIndex >= 0) && (addressIndex < mappingTestData.addresses.length)) {
            engine.geocode({
                addresses: mappingTestData.addresses[addressIndex], 
                complete: function(requestAddress, possibleMatches) {
                    COG.info("REQUESTED ADDRESS: " + requestAddress);
                    COG.info("got address matches: ", possibleMatches);
                    
                    geocodeTestAddresses(engine, addressIndex + 1, listCompleteCallback);
                }
            });
        }
        else if (listCompleteCallback) {
            listCompleteCallback();
        } // if..else
    }
    
    new COG.Testing.Suite({
        id: "tile5.mapping",
        title: "Suite of tests to test mapping in Tile5",
        testData: mappingTestData,
        
        tests: [{
            title: "Display Map",
            autoReady: false,
            runner: function(test, testData) {
                map.gotoPosition(testData.positions.goldcoast, testData.zoomLevel, function() {
                    test.ready();
                });
            }
        }]
    });
    
    new COG.Testing.Suite({
        id: "slick.mapping.routing",
        title: "SLICK Mapping > Route Tests",
        testData: mappingTestData,
        
        tests: [{
            title: "Route from Brisbane to Sydney",
            autoReady: false,
            runner: function(test, testData) {
                COG.info("requesting the route from brisbane to sydney");
                
                // calculate the route between brisbane and sydney
                T5.Geo.Routing.calculate({
                    waypoints: [
                        testData.positions.brisbane, 
                        testData.positions.toowoomba, 
                        testData.positions.mudgee,
                        testData.positions.sydney
                    ],
                    map: map
                });
                
                // set the route overlay
                // map.setRoute();
                
                test.ready();
            }
        }]
    });
    
    new COG.Testing.Suite({
        id: "slick.mapping.geocoding",
        title: "SLICK Mapping > Geocoding Tests",
        testData: mappingTestData,
        
        tests: [{
            title: "Geocoding Test",
            autoReady: false,
            runner: function(test, testData) {
                // get a mapping engine for geocoding
                var engine = T5.Geo.getEngine("geocode");
                
                if (! engine) {
                    throw new Error("No geocoding capable GEO.Engine found");
                } // if

                geocodeTestAddresses(engine, 0, function() {
                    COG.info("geocoding test complete");
                    test.ready();
                });
            }
        }]
    });
})();
