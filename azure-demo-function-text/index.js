module.exports = function (context, myBlob) {

    var Vision = require('azure-cognitiveservices-vision');
    var CognitiveServicesCredentials = require('ms-rest-azure').CognitiveServicesCredentials;
    var azure = require('azure-storage');
    var request = require("request");
    
    var imageUri = context.bindingData.uri;
    context.log(imageUri);
    
    //Split https:// from url
    var imageUriArray = imageUri.split("//");
    //Split url path
    imageUriArray = imageUriArray[1].split("/")

    //Replace "images" container to "thumbs"
    imageUriArray[1] = "thumbs"
    //Build url path
    var thumbsPath = imageUriArray.join("/");
    var thumbUri = "https://" + thumbsPath;
    context.log(thumbUri);

    var PartitionKey = "";

    var keyVar = 'AZURE_COMPUTER_VISION_KEY';

    if (!process.env[keyVar]) {
    throw new Error('please set/export the following environment variable: ' + keyVar);
    }

    let serviceKey = process.env[keyVar];

    let credentials = new CognitiveServicesCredentials(serviceKey);
    let computerVisionApiClient = new Vision.ComputerVisionAPIClient(credentials, "westeurope");
    let cvModels = computerVisionApiClient.models;

    context.log("Image name: " + context.bindingData.name);

    // Set start time to five minutes ago to avoid clock skew.
    var startDate = new Date();
    startDate.setMinutes(startDate.getMinutes() - 5);
    var expiryDate = new Date(startDate);

    imageQuery();
    
    //image query
    function imageQuery(){
        computerVisionApiClient.recognizeText(myBlob, {detectHandwriting: true}, function callback(err, result, request, response){
            if(err){
                console.log(err);
            }else if(response.headers['operation-location']){
                var operationLocation = response.headers['operation-location'];
                operationLocation=operationLocation.split("/")[6]
                console.log(operationLocation);
                getTextResult(operationLocation, function (error, results) { 
                    if(error){
                        context.log("No handwriting");
                        context.log("Error: "+ error);
                        context.done(null, error);
                    }else{
                        context.log("Handwriting Success")
                        context.bindings.imageTableInfo = [];
                        context.bindings.imageTableInfo.push({
                            PartitionKey: 'image',
                            RowKey: context.bindingData.name,
                            data: {
                                "api" : "image",
                                "imageUri" : imageUri,
                                "thumbUri" : thumbUri,
                                "handwriting": results
                            }
                        })

                        thumbnail(imageUri, function (error, outputBlob) {
                            if(error){
                                context.log("No Output Blob");
                                context.log("Error: "+ error);
                                context.done(null, error);
                            }else{
                                context.log("Output Blob")
                                context.bindings.outputBlob = outputBlob;
                                context.done(null);
                            };  
                        });
                    }; 
                });
            }else{
                console.log("no operation location");
            };
        });  
    };

    //get handwriting results
    function getTextResult(operationLocation, callback){
        computerVisionApiClient.getTextOperationResult(operationLocation, function callback(err, result, request, response){
            if(err){
                console.log(err);
                callback(error, null);
            }else{
                console.log(result.status);
                if(result.status == "Running"){
                    getTextResult(operationLocation) 
                }else{
                    results = "";
                    result.recognitionResult.lines.forEach((line, index) => {
                        results = results + line.text + "\r\n";
                    });
                    callback(null, results);
                };
            };
        });
    };
    
    //create thumbnails
    function thumbnail(imageUri, callback) {
        var options = { method: 'POST',
        url: 'https://westeurope.api.cognitive.microsoft.com/vision/v1.0/generateThumbnail',
        qs: { width: '95', height: '95', smartCropping: 'true' },
        headers: 
        { 
            'Cache-Control': 'no-cache',
            'Ocp-Apim-Subscription-Key': serviceKey,
            'Content-Type': 'application/json' },
        body: { url: imageUri },
        encoding: null,
        json: true
        };

        request(options, function (error, response, body) {

            if (error){

              // Call the callback and pass in the error
              callback(error, null);
            }
            else {

              context.log("Status Code: " + response.statusCode);

              // Call the callback and pass in the body
              callback(null, body);
            }; 
        });
    };

};
