/*
(C) 2019 David J. Kalbfleisch

The coordinate system is right-handed with +Y pointing up.
https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#coordinate-system-and-units

Cameras look towards the -Z local axis.  The +Y local axis is up.
https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#cameras
*/

"use strict";

import * as THREE from "./three.js/build/three.module.js";
import { GLTFLoader } from "./three.js/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "./three.js/examples/jsm/controls/OrbitControls.js";

// Globals
const box = new THREE.Box3();
const camera_and_cone = new THREE.Group();
const gltf_loader = new GLTFLoader();
const keys = {};
const loaded_vcs = new Set();
const world_y_axis = new THREE.Vector3(0, 1, 0);
var active_view_cell;
var camera_first_person, camera_third_person;
var container_first_person, container_third_person;
var cone;
var controls;
var renderer_first_person, renderer_third_person;
var scene;
var worker;

// These are used to clamp the position of camera_and_cone to the inside of the boundary view cells.
const world_min = new THREE.Vector3(-1275.91406, -31.21, -842.98517);
const world_max = new THREE.Vector3(914.56909, -31.21, 967.18634);

// These booleans indicate the current view cell's proximity to scene boundaries.
// The first current view cell is in the southeast corner of the scene.
var not_west_scene_boundary = true;
var not_east_scene_boundary = false;
var not_north_scene_boundary = true;
var not_south_scene_boundary = false;


function init()
{
    if (!window.Worker)
    {
        console.error("Your browser does not support web workers.");
        return false;
    }

    scene = new THREE.Scene();

    // Create a web worker thread to load geometry without blocking the UI thread.
    worker = new Worker("visibility_worker.js");
    worker.onmessage = function(event)
    {
        // Repplace the global scene with a new scene that includes the recently loaded geometry.
        scene = event.data;
    };
    worker.onerror = function(error) { console.error(error); };

    // Load the initial geometry.
    active_view_cell = 8;
    loadVCmaybe(active_view_cell);

    // Display the initial geometry's view cell.
    box.setFromCenterAndSize(new THREE.Vector3(778.66, -32.21, 855.02), new THREE.Vector3(273.82, 8.08, 226.32));
    const vc8_center = new THREE.Vector3();
    box.getCenter(vc8_center);
    const vc8_helper = new THREE.Box3Helper(box, 0x00ff00 );
    scene.add(vc8_helper);

    container_first_person = document.getElementById("first_person");
    container_third_person = document.getElementById("third_person");

    // Cameras setup, including orbit controls

    // Position the first-person camera inside the initial view cell.
    camera_first_person = new THREE.PerspectiveCamera(49.1, container_first_person.clientWidth / container_first_person.clientHeight, 0.1, 3000);

    camera_third_person = new THREE.PerspectiveCamera(49.1, container_third_person.clientWidth / container_third_person.clientHeight, 0.1, 3000);
    camera_third_person.position.set(vc8_center.x, 300, 1500);
    controls = new OrbitControls(camera_third_person, container_third_person);

    scene.background = new THREE.Color(0x222222);

    // Without lighting, the materials loaded from glTF will be black.  (They are not shadeless.)
	const light = new THREE.HemisphereLight();
	light.position.set(0, 1, 0);
	scene.add(light);

    // Cone setup
    const cone_geometry = new THREE.ConeBufferGeometry(5, 10);
    const cone_material = new THREE.MeshBasicMaterial({color: 0xff0000, wireframe: true});
    cone = new THREE.Mesh(cone_geometry, cone_material);
    cone.rotateX(-Math.PI / 2);

    // Group setup
    camera_and_cone.position.copy(vc8_center);
    camera_and_cone.add(camera_first_person);
    camera_and_cone.add(cone);
    scene.add(camera_and_cone);
	camera_third_person.lookAt(camera_and_cone.position);

    // First person renderer setup
    renderer_first_person = new THREE.WebGLRenderer({antialias: true});
    renderer_first_person.setPixelRatio(window.devicePixelRatio);
    renderer_first_person.gammaOutput = true;
    renderer_first_person.gammaFactor = 2.2;
    renderer_first_person.setSize(container_first_person.clientWidth, container_first_person.clientHeight);
    container_first_person.appendChild(renderer_first_person.domElement);

    // Third person renderer setup
    renderer_third_person = new THREE.WebGLRenderer({antialias: true});
    renderer_third_person.setPixelRatio(window.devicePixelRatio);
    renderer_third_person.gammaOutput = true;
    renderer_third_person.gammaFactor = 2.2;
    renderer_third_person.setSize(container_third_person.clientWidth, container_third_person.clientHeight);
    container_third_person.appendChild(renderer_third_person.domElement);

    // Listeners
    document.addEventListener("keydown", onKeyUpDown, false);
    document.addEventListener("keyup", onKeyUpDown, false);
    window.addEventListener("resize", onWindowResize);

    return true;
}


function onKeyUpDown(event)
{
    // Set the global key map entry for the given key to true when the key is pressed; false when released.
    keys[event.key.toLowerCase()] = event.type == "keydown";
}


function onWindowResize()
{
    camera_first_person.aspect = container_first_person.clientWidth / container_first_person.clientHeight;
    camera_first_person.updateProjectionMatrix();
    renderer_first_person.setSize(container_first_person.clientWidth, container_first_person.clientHeight);

    camera_third_person.aspect = container_third_person.clientWidth / container_third_person.clientHeight;
    camera_third_person.updateProjectionMatrix();
    renderer_third_person.setSize(container_third_person.clientWidth, container_third_person.clientHeight);
}


function updateView()
/* Update the position and rotation in response to keyboard events. */
{
    var group_clone = null;

    // Rotations.  Only rotate once per key press.
    // TODO - Holding the key down still affects rotation after a delay.
    // TODO - Smooth rotations

    if (keys["i"] && !keys["k"])
    {
        // Look up.
        camera_and_cone.rotateX(Math.PI / 8);
        keys["i"] = false;
    }
    else if (keys["k"] && !keys["i"])
    {
        // Look down.
        camera_and_cone.rotateX(-Math.PI / 8);
        keys["k"] = false;
    }
    if (keys["j"] && !keys["l"])
    {
        // Rotate left.
        camera_and_cone.rotateOnWorldAxis(world_y_axis, Math.PI / 4);
        keys["j"] = false;
    }
    else if (keys["l"] && !keys["j"])
    {
        // Rotate right.
        camera_and_cone.rotateOnWorldAxis(world_y_axis, -Math.PI / 4);
        keys["l"] = false;
    }

    // Translations.  First check that a collision will not occur.

    if (keys["s"] && !keys["f"])
    {
        // Strafe left.
        group_clone = camera_and_cone.clone(false);
        group_clone.translateX(-1);
    }
    else if (keys["f"] && !keys["s"])
    {
        // Strafe right.
        group_clone = camera_and_cone.clone(false);
        group_clone.translateX(1);
    }

    if (keys["e"] && !keys["d"])
    {
        // Move forward.
        if (group_clone === null)
            group_clone = camera_and_cone.clone(false);
        group_clone.translateZ(-1);
    }
    else if (keys["d"] && !keys["e"])
    {
        // Move backward.
        if (group_clone === null)
            group_clone = camera_and_cone.clone(false);
        group_clone.translateZ(1);
    }

    if ((group_clone !== null) && !collisionDetected(group_clone.position))
    {
        // There is no collision.  Execute the translation.
        camera_and_cone.position.copy(group_clone.position);

        // Clamp the first-person camera, and update scene and view cell geometry as necessary.
        camera_and_cone.position.clamp(world_min, world_max);
        updateGeometry();
    }
}


function collisionDetected(prospective_position)
/* Return a boolean indicating if a collision will occur if the camera_and_cone group attempts to move to the given position. */
{
    console.assert(!prospective_position.equals(camera_and_cone.position), "Don't call this function unless there is prospective translational movement.");

    var direction = new THREE.Vector3();
    direction.subVectors(prospective_position, camera_and_cone.position).normalize();
    const raycaster = new THREE.Raycaster(camera_and_cone.position, direction, 0, 1.5);
    var intersections = [];

    scene.traverse(function(child)
    {
        if (intersections.length > 0)
            // An intersection has already been found.  Do not continue casting rays.
            return;

        if (child.isMesh && (child.id != cone.id))
        {
            child.raycast(raycaster, intersections);

            if (intersections.length > 0)
                console.debug("Collision detected with object %d.", child.id);
        }
    });

    return (intersections.length > 0);
}


function animate()
{
    requestAnimationFrame(animate);
    updateView();

    camera_and_cone.visible = false;
    renderer_first_person.render(scene, camera_first_person);

    camera_and_cone.visible = true;
    renderer_third_person.render(scene, camera_third_person);
}


function updateGeometry()
/* As applicable, load new geometry, and update the view cell display. */
{
    // When the aggregate geometry is viewed from overhead, view cell 57 is in the top left corner.
    // Calculate the position of camera_and_cone relative to the lower top left vertex of view cell 57.
    const aggregateX = camera_and_cone.position.x + 1276.91406;
    const aggregateZ = camera_and_cone.position.z + 843.98517;

    // Determine if the aggregate position is near one or more of the current view cell's boundaries.
    // Note that the current view cell might not yet have been set as the active view cell.
    const relativeX = aggregateX % 273.82080;
    const relativeZ = aggregateZ % 226.32341;

    // These booleans indicate the relative location's proximity to view cell boundaries.
    // There are minimums to disregard floating point errors.
    const west_vc_boundary = (2 < relativeX && relativeX < 30);
    const east_vc_boundary = (243 < relativeX && relativeX < 272);
    const north_vc_boundary = (2 < relativeZ && relativeZ < 30);
    const south_vc_boundary = (196 < relativeZ && relativeZ < 225);

    if (box.containsPoint(camera_and_cone.position))
    {
        // Load additional geometry, if necessary.

        // west <-> east
        if (west_vc_boundary)
        {
            console.debug("west boundary");
            if (not_west_scene_boundary)
                loadVCmaybe(active_view_cell - 1);
        }
        else if (east_vc_boundary)
        {
            console.debug("east boundary");
            if (not_east_scene_boundary)
                loadVCmaybe(active_view_cell + 1);
        }

        // north <-> south
        if (north_vc_boundary)
        {
            console.debug("north boundary");
            if (not_north_scene_boundary)
                loadVCmaybe(active_view_cell + 8);
        }
        else if (south_vc_boundary)
        {
            console.debug("south boundary");
            if (not_south_scene_boundary)
                loadVCmaybe(active_view_cell - 8);
        }

        // Diagonals
        if (west_vc_boundary && north_vc_boundary)
        {
            if (not_west_scene_boundary && not_north_scene_boundary)
                loadVCmaybe(active_view_cell + 7);
        }
        else if (east_vc_boundary && north_vc_boundary)
        {
            if (not_east_scene_boundary && not_north_scene_boundary)
                loadVCmaybe(active_view_cell + 9);
        }
        else if (east_vc_boundary && south_vc_boundary)
        {
            if (not_east_scene_boundary && not_south_scene_boundary)
                loadVCmaybe(active_view_cell - 7);
        }
        else if (west_vc_boundary && south_vc_boundary)
        {
            if (not_west_scene_boundary && not_south_scene_boundary)
                loadVCmaybe(active_view_cell - 9);
        }
    }
    else
    {
        // The current position is outside the active view cell.  Update the active view cell and box position.
        // Checking the scene boundary booleans is necessary due to floating point errors.

        const box_translation = new THREE.Vector3();
        const box_center = new THREE.Vector3();
        box.getCenter(box_center);
        const x_difference = camera_and_cone.position.x - box_center.x;
        const z_difference = camera_and_cone.position.z - box_center.z;

        if (x_difference > 136.9104)
        {
            // Moved eastward out of the active view cell.
            if (not_east_scene_boundary)
            {
                active_view_cell += 1;
                box_translation.add(new THREE.Vector3(273.82080, 0, 0));
            }
        }
        else if (x_difference < -136.9104)
        {
            // Moved westward out of the active view cell.
            if (not_west_scene_boundary)
            {
                active_view_cell -= 1;
                box_translation.add(new THREE.Vector3(-273.82080, 0, 0));
            }
        }

        if (z_difference > 113.161705)
        {
            // Moved southward out of the active view cell.
            if (not_south_scene_boundary)
            {
                active_view_cell -= 8;
                box_translation.add(new THREE.Vector3(0, 0, 226.32341));
            }
        }
        else if (z_difference < -113.161705)
        {
            // Moved northward out of the active view cell.
            if (not_north_scene_boundary)
            {
                active_view_cell += 8;
                box_translation.add(new THREE.Vector3(0, 0, -226.32341));
            }
        }

        box.translate(box_translation);

        not_west_scene_boundary = (active_view_cell % 8 != 1);
        not_east_scene_boundary = (active_view_cell % 8 != 0);
        not_north_scene_boundary = (active_view_cell < 57);
        not_south_scene_boundary = (active_view_cell > 8);

        console.debug("Active view cell: %d", active_view_cell);
    }
}


function loadVCmaybe(vc)
/* Load the given view cell, passed as an integer index, if it has not already been loaded. */
{
    if (loaded_vcs.has(vc))
        // The view cell has already been loaded.
        return;

    console.info("Loading vc%d.gltf", vc);
    gltf_loader.load("geometry/vc" + vc + ".gltf", gltf_loader_onload, null, function(error) {console.error(error);});
    loaded_vcs.add(vc);
}


function gltf_loader_onload(gltf)
{
    // https://threejs.org/docs/index.html#api/en/core/Object3D.traverse
    gltf.scene.traverse(function(child)
    {
        if (child.isMesh)
            // Turn off backface culling.
            child.material.side = THREE.DoubleSide;
    });

    // Add the loaded geometry to the global "scene".
    worker.postMessage([scene, gltf.scene]);
}


export { animate, init };

