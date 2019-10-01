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

    //Create Blob Service
    var blobService = azure.createBlobService();

    //Creates container if not exists
    blobService.createContainerIfNotExists('thumbs', {publicAccessLevel : 'blob'}, function(error) {
        if(error) {
            context.log(error);
        };
    });

    //Replace "images" container to "thumbs"
    imageUriArray[1] = "thumbs"
    //Build url path
    var thumbsPath = imageUriArray.join("/");
    var thumbUri = "https://" + thumbsPath;
    context.log(thumbUri);

    var PartitionKey = "";

    var keyCognitive = 'AZURE_COGNITIVE_SERVICES_KEY';
    var keyRegion = 'AZURE_COGNITIVE_SERVICES_REGION';
    
    if (!process.env[keyCognitive] || !process.env[keyRegion]) {
    throw new Error('please set/export the following environment variables: ' + keyCognitive + ' ' + keyRegion);
    }

    let serviceKey = process.env[keyCognitive];
    let region = process.env[keyRegion];


    let credentials = new CognitiveServicesCredentials(serviceKey);
    let computerVisionApiClient = new Vision.ComputerVisionAPIClient(credentials, region);

    context.log("Image name: " + context.bindingData.name);

    imageQuery();
    
    //image query
    function imageQuery(){
        context.log("Image Query");
        computerVisionApiClient.recognizeTextInStream(myBlob, {detectHandwriting: true}, function callback(error, result, request, response){
            if(error){
                context.log(error);
                context.done(null, error);
            }else if(response.headers['operation-location']){
                var operationLocation = response.headers['operation-location'];
                operationLocation=operationLocation.split("/")[6]
                context.log("OperationId: " + operationLocation);
                context.log("Text loaded for analysis!");

                getTextResult(operationLocation, function (error, results) {
                
                    if(error){
                        context.log("No handwriting");
                        context.log("Error: "+ error);
                        context.done(null, error);
                    }
                    else {
                        context.log("Handwriting Analisys Success")
                        
                        var handwriting = "";
                        results.recognitionResult.lines.forEach(function(line) {
                            handwriting = handwriting + line.text + "\r\n";
                          });
                        context.log(handwriting);

                        context.bindings.imageTableInfo = [];
                        context.bindings.imageTableInfo.push({
                            PartitionKey: 'text',
                            RowKey: context.bindingData.name,
                            data: {
                                "api" : "text",
                                "imageUri" : imageUri,
                                "thumbUri" : thumbUri,
                                "handwriting": handwriting
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
                context.log("no operation location");
                context.done(null, error);
            };
        });  
    };

    //get handwriting results
    function getTextResult(operationLocation, callback) {

        // Define the function to make the call to Azure
        var getResult = function() {
      
          // Make the call to Azure
          computerVisionApiClient.getTextOperationResult(operationLocation, function (error, result, request, response) {
      
            // Check the error
            if (error) {
      
              // Call the callback and pass in the error
              callback(error, null);
            }
            else {
      
              // Check the result status
              if (result.status == "Running") {
      
                // Log that the job is still running
                context.log("Running...");
      
                // Call the function again to get the updated result after 3 seconds wait.
                setTimeout(function(){ getResult(); }, 3000);
              }
              else if (result.status == "NotStarted") {

                // Log that the job is still running
                context.log("Not Started...");
                
                // Call the function again to get the updated result after 3 seconds wait.
                setTimeout(function(){ getResult(); }, 3000);
              }
              else if (result.status == "Succeeded") {
      
                // Call the callback and pass in the result

                callback(null, result);
              }
              else {
      
                // Call the callback and pass in the error
                callback("The status has changed to " + result.status, null);
              }
            }
          });
        }
      
        // Call the get result function
        getResult();
    };
    
    //create thumbnails
    function thumbnail(imageUri, callback) {
        var options = { method: 'POST',
        url: 'https://'+region+'.api.cognitive.microsoft.com/vision/v1.0/generateThumbnail',
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
