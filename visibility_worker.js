/*
(C) 2019 David J. Kalbfleisch

This worker adds new scene geometry to the existing scene without blocker the main/UI thread.
Not adding new geometry in a worker results in a visible "hiccup".
*/

"use strict";


// Don't define this as "function onmessage(event)" because that creates a new local scope.
// The goal is to redefine DedicatedWorkerGlobalScope.onmessage.
onmessage = function(event)
/* Add the newly loaded gltf.scene (event.data[1]) to the existing scene (event.data[0]). */
{
    event.data[0].add(event.data[1]);
    postMessage(event.data[0]);
}

