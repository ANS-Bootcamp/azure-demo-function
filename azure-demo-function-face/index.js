module.exports = function (context, myBlob) {

    var FaceAPIClient = require('azure-cognitiveservices-face');
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

    var keyVar = 'AZURE_COMPUTER_VISION_FACE_KEY';

    if (!process.env[keyVar]) {
    throw new Error('please set/export the following environment variable: ' + keyVar);
    }

    let serviceKey = process.env[keyVar];

    let credentials = new CognitiveServicesCredentials(serviceKey);
    let client = new FaceAPIClient(credentials, "westeurope");

    context.log("Image name: " + context.bindingData.name);

    // Set start time to five minutes ago to avoid clock skew.
    var startDate = new Date();
    startDate.setMinutes(startDate.getMinutes() - 5);
    var expiryDate = new Date(startDate);

    imageQuery();
    
    //image query
    function imageQuery(){
        client.face.detectInStream(myBlob, {returnFaceAttributes: ['age','gender','headPose','smile','facialHair','glasses','emotion','hair','makeup','occlusion','accessories','exposure','noise']})
          
            .then(function(data){    
                // write to azure table
                context.log("data: " + JSON.stringify(data));
                context.bindings.imageTableInfo = [];
                context.bindings.imageTableInfo.push({
                    PartitionKey: 'face',
                    RowKey: context.bindingData.name,
                    data: {
                        "api" : "face",
                        "imageUri" : imageUri,
                        "thumbUri" : thumbUri,
                        "faceAttributes" : data.faceAttributes
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
