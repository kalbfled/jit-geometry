/*
(C) 2019 David J. Kalbfleisch

This worker loads new scene geometry without blocker the main/UI thread.
*/

"use strict";

importScripts("./three.js/build/three.min.js", "./three.js/examples/js/loaders/GLTFLoader.js");

const gltf_loader = new THREE.GLTFLoader();
console.assert(gltf_loader !== null);
const loaded_vcs = new Set();

// Don't define this as "function onmessage(event)" because that creates a new local scope.
// The goal is to redefine DedicatedWorkerGlobalScope.onmessage.
onmessage = function(event)
/* Load the given view cell (event.data), passed as an integer index, if it has not already been loaded. */
{
    console.assert(typeof(event.data) === "number");
    if (!loaded_vcs.has(event.data))
    {
        console.info("Loading vc%d.gltf", event.data);
        gltf_loader.load("geometry/vc" + event.data + ".gltf", gltf_loader_onload, null, function(error) {console.error(error);});
        loaded_vcs.add(event.data);
    }
    // Else, the view cell has already been loaded.
};


function gltf_loader_onload(gltf)
/* Return, via message post, the parsed glTF object. */
{
    gltf.scene.traverse(function(child)
    {
        if (child.isMesh)
            // Turn off backface culling.
            child.material.side = THREE.DoubleSide;
    });

    postMessage(gltf.scene);
}

