'use strict';

function firstProfileRequest(requests,profile){
 if(!Array.isArray(requests)||!['A','B'].includes(profile))throw Error('Invalid synthetic profile requests');
 return requests.find(request=>request?.url==='/persistence/'+profile)||null;
}

module.exports={firstProfileRequest};
