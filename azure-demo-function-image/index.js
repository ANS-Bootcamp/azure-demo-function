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
        computerVisionApiClient.analyzeImageInStream(myBlob, {visualFeatures: ["Categories", "Tags", "Description", "Color"]})
          
            .then(function(data){    
                // write to azure table
                //context.log("data: " + JSON.stringify(data));
                context.bindings.imageTableInfo = [];
                context.bindings.imageTableInfo.push({
                    PartitionKey: 'image',
                    RowKey: context.bindingData.name,
                    data: {
                        "api" : "image",
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
                        context.log("Error: "+ error);
                        context.done(null, error);
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
