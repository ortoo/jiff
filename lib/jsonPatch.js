/** @license MIT License (c) copyright 2010-2014 original author or authors */
/** @author Brian Cavalier */
/** @author John Hann */

var patches = require('./patches');
var clone = require('./clone');
var InvalidPatchOperationError = require('./InvalidPatchOperationError');

exports.apply = patch;
exports.applyInPlace = patchInPlace;
exports.clone = clone;
exports.isValidObject = isValidObject;
exports.defaultHash = defaultHash;

var defaultOptions = {};

/**
 * Apply the supplied JSON Patch to x
 * @param {array} changes JSON Patch
 * @param {object|array|string|number} x object/array/value to patch
 * @param {object} options
 * @param {function(index:Number, array:Array, context:object):Number} options.findContext
 *  function used adjust array indexes for smarty/fuzzy patching, for
 *  patches containing context
 * @returns {object|array|string|number} patched version of x. If x is
 *  an array or object, it will be mutated and returned. Otherwise, if
 *  x is a value, the new value will be returned.
 */
function patch(changes, x, options) {
	return patchInPlace(changes, clone(x), options);
}

function patchInPlace(changes, x, options) {
	if (!options) {
		options = defaultOptions;
	}

	// TODO: Consider throwing if changes is not an array
	if (!Array.isArray(changes)) {
		return x;
	}

	var patch, p;
	for (var i = 0; i < changes.length; ++i) {
		p = changes[i];
		patch = patches[p.op];

		if (patch === void 0) {
			throw new InvalidPatchOperationError('invalid op ' + JSON.stringify(p));
		}

		// Are we modifying a mongoose object? If so we may need to faff around
		// making sure the correct paths have been marked as modified.
		// At the mo this is just making sure we mark a Mixed (e.g. any) schema
		// as modified when any property within it changes.
		// To see if it is a mongoose object just check for the properties we'd expect
		const mongooseSchemaType =
			x.schema &&
			typeof x.set === 'function' &&
			typeof x.markModified === 'function' &&
			x.schema.path(toMongoosePath(p.path));
		const isMongooseMixed = mongooseSchemaType && mongooseSchemaType.instance === 'Mixed';

		// If this isn't a Mixed mongoose object then we want to set properties to `undefined`
		// as our delete (so mongoose will pick them up). If it is a Mixed object then we
		// do a js `delete`. Turns out that _not_ doing that means that mongoose or the Mongodb
		// driver sends `null` rather than `undefined` over the wire and so deleted things
		// get set to null... Sigh
		x = patch.apply(x, p, { ...options, deleteOnRemove: isMongooseMixed });

		if (p.op !== 'test' && isMongooseMixed) {
			// Use schemaType.path here because it will resolve to the root
			// Mixed path, rather than the nested property that we may be at
			// e.g. a path of `constitution.something` will have schemaType.path of
			// `constitution`
			x.markModified(mongooseSchemaType.path);
		}
	}

	return x;
}

function defaultHash(x) {
	return isValidObject(x) || isArray(x) ? JSON.stringify(x) : x;
}

function isValidObject(x) {
	return x !== null && Object.prototype.toString.call(x) === '[object Object]';
}

function isArray(x) {
	return Object.prototype.toString.call(x) === '[object Array]';
}

function toMongoosePath(path) {
	return path.substring(1).replace(/\//g, '.');
}
