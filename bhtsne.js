const tmp = require('tmp')
const path = require('path')
const fs = require('fs')
const Buffer = require('buffer').Buffer
const bhtsne = require('./build/Release/bhtsne')
const cp = require('child_process')

const defaultOpts = {
	dims: 2,
	initialDimensions: 50,
	perplexity: 50,
	theta: 0.5,
	maxIterations: 1000,
	verbose: false,
	randseed: -1
}

module.exports = function(data, userOpts) {
	return new Promise(function(resolve, reject) {
		tmp.dir((err, tmpDir) => {
			if (err) return reject(err)
			// change working dir, as the c++ code uses cwd
			process.chdir(tmpDir)
			// setup options for the TSNE
			const opts = Object.assign({}, defaultOpts, userOpts)
			// the number of dimensions in the data 
			dataDim = data[0].length
			// the total amount of data
			dataCount = data.length

			// a binary stream of data that gets buffers written to it, the data.dat file
			const ws = fs.createWriteStream(path.resolve(tmpDir, './data.dat'))
			// allocate a bunch of space for tye following data chunks
			const headerBuff = Buffer.alloc(32, 0)
			headerBuff.writeInt32LE(dataCount, 0)
			headerBuff.writeInt32LE(dataDim, 4)
			headerBuff.writeDoubleLE(opts.theta, 8)
			headerBuff.writeDoubleLE(opts.perplexity, 16)
			headerBuff.writeInt32LE(opts.dims, 24)
			headerBuff.writeInt32LE(opts.maxIterations, 28)
			// write that data to the file
			ws.write(headerBuff)

			// allocate memory again
			const dataBuff = Buffer.alloc(8*dataDim*dataCount, 0)
			// write in the data to the buffer
			for (let n = 0; n < dataCount; n++) {
				for (let d = 0; d < dataDim; d++) {
					dataBuff.writeDoubleLE(data[n][d], 8*n*dataDim + 8*d)
				}
			}

			// write the buffer to the file
			ws.write(dataBuff)
			if (opts.randseed !== defaultOpts.randseed) {
				const randseedBuff = Buffer.alloc(4, 0)
				randseedBuff.writeInt32LE(opts.randseed, 0)
				ws.write(randseedBuff)
			}
			// kill the stream
			ws.end()
			// when it is done writing (finish)
			ws.on('finish', () => {
				// run the entire TSNE inside of a child process
				const bp = cp.fork(`${__dirname}/runbhtsne.js`)
				// TSNE is done
				bp.send('start')
				bp.on('message', msg => {
					// print message from result
					console.log(msg)
					// read the result.dat file for the results of the TSNE
					fs.open(path.resolve(tmpDir, `./result${opts.maxIterations - 1}.dat`), 'r', (err, fd) => {
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
							// sort the unordered pairs in place by 
							const result = unorderedResult.sort((a,b) => (a[0] - b[0])).map((e) => e[1])
	
							resolve(result)
						})
					})
				})
			})
		})
	})
}
