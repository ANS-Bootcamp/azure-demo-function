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

    visionQuery();
    

    function visionQuery(){
      computerVisionApiClient.analyzeImageInStream(myBlob, {visualFeatures: ["Categories", "Tags", "Description", "Color", "Faces", "ImageType"]})
            .then(function(data) {

                // description Results
                if(data.description.captions.length > 0){
                    context.log(`The image can be described as: ${data.description.captions[0].text}`);
                    context.log(`Confidence of description: ${Math.round(new Number(data.description.captions[0].confidence) * 100).toFixed(1)} %`);
                }else{
                    context.log("Didn't see any image descriptions..");
                };

                // Tag Results
                if (data.tags.length > 0){
                    context.log("Tags associated with this image:\nTag\t\tConfidence");
                    for (let i=0; i < data.tags.length; i++){
                        context.log(`${data.tags[i].name}\t\t${data.tags[i].confidence}`);
                    };
                }else{
                    context.log("Didn't see any image tags..");
                };

                // Colour Results
                context.log(`The primary colors of this image are: ${data.color.dominantColors.join(', ')}.`); 

                return data               
            })
            
            .then(function(data){    
                // write to azure table
                context.bindings.imageTableInfo = [];
                context.bindings.imageTableInfo.push({
                    PartitionKey: "images",
                    RowKey: context.bindingData.name,
                    data: {
                        "imageUri" : imageUri,
                        "thumbUri" : thumbUri,
                        "description": {
                            "value": data.description.captions[0].text,
                            "confidence": Math.round(new Number(data.description.captions[0].confidence) * 100).toFixed(1)
                        },
                        "tags": {
                            "value": data.tags
                        },
                        "colours": {
                            "value": data.color.dominantColors.join(', ')
                        }
                    }
                })

                thumbnail(imageUri, function (error, outputBlob) {

                    if (error) {
                        context.log("No Output Blob");
                        context.log(`Error: ${error}`);
                        context.done(null, erroe);
                    }
                    else {
                        context.log("Output Blob")
                        context.bindings.outputBlob = outputBlob;
                        context.done(null);
                    };  
                })
            })

            .catch(function(err) {
                context.log(`Error: ${err}`);
                context.done(null, err);
            })

    };

    function thumbnail(imageUri, callback) {
        var options = { method: 'POST',
        url: 'https://westeurope.api.cognitive.microsoft.com/vision/v1.0/generateThumbnail',
        qs: { width: '72', height: '72', smartCropping: 'true' },
        headers: 
        { 
            'Cache-Control': 'no-cache',
            'Ocp-Apim-Subscription-Key': serviceKey,
            'Content-Type': 'application/json' },
        body: { url: imageUri },
        encoded: null};

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
