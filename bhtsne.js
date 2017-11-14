const tmp = require('tmp')
const path = require('path')
const fs = require('fs')
const Buffer = require('buffer').Buffer
const cp = require('child_process')
const mkdirp = require('mkdirp')

const defaultOpts = {
	dims: 2,
	initialDimensions: 50,
	perplexity: 50,
	theta: 0.5,
	maxIterations: 1000,
	verbose: false,
	randseed: -1
}

// thank you: https://stackoverflow.com/questions/21194934/node-how-to-create-a-directory-if-doesnt-exist
function ensureExists(resultPath, mask, cb) {
    if (typeof mask == 'function') { // allow the `mask` parameter to be optional
        cb = mask;
        mask = 0777;
    }
    mkdirp(resultPath, mask, function(err) {
        if (err) {
			console.log('Error in ensureExists:', err)
            if (err.code == 'EEXIST') cb(null); // ignore the error if the folder already exists
            else cb(err); // something else went wrong
        } else cb(null); // successfully created folder
    });
}

module.exports.bhtsne = (data, userOpts, configHash, resultPath) => {
	return new Promise(function(resolve, reject) {
		tmp.dir((err, tmpDir) => {
			if (err) return reject(err)
			// make data ouput directory
			ensureExists(resultPath, 0744, function(err) {
				if (err) return reject(err) // handle folder creation error
			})

			// change working dir, as the c++ code uses cwd
			process.chdir(tmpDir)
			// setup options for the TSNE
			const opts = Object.assign({}, defaultOpts, userOpts)
			// the number of dimensions in the data
			const dataDim = data[0].length
			// the total amount of data
			const dataCount = data.length
			// add the null terminating character to the result path
			resultPath = resultPath + '\0'
			// the total length of the path
			const pathByteLength = Buffer.byteLength(resultPath, 'utf-8')

			// a binary stream of data that gets buffers written to it, the data.dat file
			const ws = fs.createWriteStream(path.resolve(tmpDir, './data.dat'))

			// allocate a bunch of space for the following data chunks
			const headerBuff = Buffer.alloc(36 + pathByteLength, 0)
			headerBuff.writeInt32LE(dataCount, 0)
			headerBuff.writeInt32LE(dataDim, 4)
			headerBuff.writeDoubleLE(opts.theta, 8)
			headerBuff.writeDoubleLE(opts.perplexity, 16)
			headerBuff.writeInt32LE(opts.dims, 24)
			headerBuff.writeInt32LE(opts.maxIterations, 28)
			headerBuff.writeInt32LE(pathByteLength, 32)
			headerBuff.write(resultPath, 36, pathByteLength)

			// write that data to the file
			if(!ws.write(headerBuff)){
				reject("Writing parameters to data.dat failed")
			}

			// allocate memory again
			const dataBuff = Buffer.alloc(8*dataDim*dataCount, 0)
			// write in the data to the buffer
			for (let n = 0; n < dataCount; n++) {
				for (let d = 0; d < dataDim; d++) {
					dataBuff.writeDoubleLE(data[n][d], 8*n*dataDim + 8*d)
				}
			}
			// write the data buffer to the file
			if(!ws.write(dataBuff)){
				ws.once('drain', () => {
					if(!ws.write(dataBuff))
					reject("Writing data to data.dat failed")
				})
			}

			if (opts.randseed !== defaultOpts.randseed) {
				const randseedBuff = Buffer.alloc(4, 0)
				randseedBuff.writeInt32LE(opts.randseed, 0)
				if(!ws.write(randseedBuff)){
					ws.once('drain', () => {
						if(!ws.write(randseedBuff))
						reject("writing randseed to data.dat failed")
					})
				}
			}
			// kill the stream
			ws.end()
			// when it is done writing (finish)
			ws.on('finish', () => {
				// break TSNE off into a child process
				console.log('Launching bhtsne fork')
				const bp = cp.fork(`${__dirname}/runbhtsne.js`)
				// trigger the TSNE run
				bp.send('start')
				// recieve feedback on the TSNE run
				bp.on('message', msg => {
					// print completion message
					console.log(msg)
				})
			})
		})
	})
}

module.exports.getTSNEIteration = (iteration, configHash, userOpts, data, resultPath) => {
	return new Promise(function(resolve, reject) {
		// the number of dimensions in the data
		const dataDim = data[0].length
		// the total amount of data
		const dataCount = data.length
		// setup options for the TSNE
		const opts = Object.assign({}, defaultOpts, userOpts)
		// read the result.dat file for the results of the TSNE
		fs.open(path.resolve(resultPath, `./result${iteration}.dat`), 'r', (err, fd) => {
			// check for errors
			if (err) return reject(err)
			// The first two integers are just the number of samples and the dimensionality, no need to read those
			const offset = 4*2
			// the length of the results
			const resultLen = 8 * opts.dims * dataCount
			// not sure what landmarks are but its 4 times the datacount long
			const landmarksLen = 4 * dataCount
			// The next part of the data is the unordered results and the landmarks
			// read the data, allocate enough data for all of the data including landmarks, zero offset, total length, start after the first two nums, and callback
			fs.read(fd, Buffer.alloc(resultLen + landmarksLen), 0, resultLen + landmarksLen, offset, (err, bytesRead, buffer) => {
				// exit if errors
				if (err) return reject(err)
				// allocate unordered array
				const unorderedResult = []
				// go through all of the data
				for(let i = 0; i < dataCount; i++) {
					// allocate an array for the coordinates
					const coords = []
					// go through each of the dimensions
					for (let c = 0; c < opts.dims; c++) {
						// push the data for each dimension into the array for a row
						coords.push(buffer.readDoubleLE(i * 8 * opts.dims + 8 * c))
					}
					// read the landmark in for i
					let landmark = buffer.readInt32LE(resultLen + 4*i)
					// push the landmark and coords pair into unorderedResult
					unorderedResult.push([landmark, coords])
				}
				// sort the unordered pairs in place
				const result = unorderedResult.sort((a,b) => (a[0] - b[0])).map((e) => e[1])
				fs.close(fd)
				resolve(result)
			})
		})
	})
}
