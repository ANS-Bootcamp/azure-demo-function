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

    var keyVar = 'AZURE_COMPUTER_VISION_KEY';
    var keyVarFace = 'AZURE_COMPUTER_VISION_FACE_KEY';
    var region = 'AZURE_COMPUTER_VISION_REGION';
    
    if (!process.env[keyVar] || !process.env[keyVarFace] || !process.env[region]) {
    throw new Error('please set/export the following environment variables: ' + keyVar + ' ' + keyVarFace);
    }

    let serviceKey = process.env[keyVar];
    let serviceKeyFace = process.env[keyVarFace];

    let credentials = new CognitiveServicesCredentials(serviceKeyFace);
    let client = new FaceAPIClient(credentials, region);

    context.log("Image name: " + context.bindingData.name);

    imageQuery();
    
    //image query
    function imageQuery(){
        client.face.detectInStream(myBlob, {returnFaceAttributes: ['age','gender','smile','facialHair','glasses','emotion','hair','makeup']})
          
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
                        "faceAttributes" : data[0].faceAttributes
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
