

// Main handeler
module.exports = function (context, myBlob) {

    var Vision = require('azure-cognitiveservices-vision');
    var CognitiveServicesCredentials = require('ms-rest-azure').CognitiveServicesCredentials;
    var azure = require('azure-storage');
    var uri = null

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
    thumbnails();

    function visionQuery(){
      computerVisionApiClient.analyzeImageInStream(myBlob, {visualFeatures: ["Categories", "Tags", "Description", "Color", "Faces", "ImageType"]})
            .then(function(data) {
                //binding Data
                //context.log("Binding Data: " + JSON.stringify(context.bindingData))

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
                // create public url for image
                var blobService = azure.createBlobService();
                // Create a SAS token that expires in 24 hours

                var permissions = permissions || azure.BlobUtilities.SharedAccessPermissions.READ;

                var sharedAccessPolicy = {
                    AccessPolicy: {
                        Permissions: permissions,
                        Start: startDate,
                        Expiry: expiryDate
                    }
                };

                var blobPath = context.bindingData.blobTrigger.split("/");
                context.log("Container: " + blobPath[0]);
                context.log("Image: " + blobPath[1]);
                var sasToken = blobService.generateSharedAccessSignature(blobPath[0], blobPath[1], sharedAccessPolicy);
                uri = blobService.getUrl(blobPath[0], blobPath[1], sasToken, true);

                return data
            })

            .then(function(data){    
                // write to azure table
                context.bindings.imageTableInfo = [];
                var rowkey = Date.now().toString();
                context.log(rowkey)
                    context.bindings.imageTableInfo.push({
                        PartitionKey: "images",
                        RowKey: rowkey,
                        data: {
                            "secureuri" : uri,
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
                // Finished
                context.done(null, data);
            })

            .catch(function(err) {
                context.log(`Error: ${err}`);
                context.done(null, err);
            })

    };

    function thumbnails(){
        computerVisionApiClient.generateThumbnailInStream(72, 72, myBlob, {smartCropping: true})
        .then(function(response){
            context.bindings.outputBlob = response;
            context.log("Processed Thumbnail");
            context.done(null);
            //context.log(result);
        })

        .catch(function(err) {
            context.log(`Error: ${err}`);
            context.done(null, err);
        })
        
    };


};