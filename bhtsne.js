const bhtsne = require('./build/Release/bhtsne')
const fs = require('fs')
const Buffer = require('buffer').Buffer
const tmp = require('tmp')

const defaultOpts = {
	dims: 2,
	initialDimensions: 50,
	perplexity: 50,
	theta: 0.5,
	maxIterations: 1000,
	verbose: false,
	randseed: -1
}

module.exports = function(data, userOpts, callback) {
	tmp.dir((err, path) => {
		const oldWd = process.cwd()
		process.chdir(path)
		dataDim = data[0].length
		dataCount = data.length
		const opts = Object.assign({}, defaultOpts, userOpts)
		const ws = fs.createWriteStream('./data.dat')
		const headerBuff = Buffer.alloc(32, 0)
		headerBuff.writeInt32LE(dataCount, 0)
		headerBuff.writeInt32LE(dataDim, 4)
		headerBuff.writeDoubleLE(opts.theta, 8)
		headerBuff.writeDoubleLE(opts.perplexity, 16)
		headerBuff.writeInt32LE(opts.dims, 24)
		headerBuff.writeInt32LE(opts.maxIterations, 28)
		ws.write(headerBuff)
		const dataBuff = Buffer.alloc(8*dataDim*dataCount, 0)
		for (let n = 0; n < dataCount; n++) {
			for (let d = 0; d < dataDim; d++) {
				dataBuff.writeDoubleLE(data[n][d], 8*n*dataDim + 8*d)
			}
		}
		ws.write(dataBuff)
		if (opts.randseed !== defaultOpts.randseed) {
			const randseedBuff = Buffer.alloc(4, 0)
			randseedBuff.writeInt32LE(opts.randseed, 0)
			ws.write(randseedBuff)
		}
		ws.end()
		ws.on('finish', () => {
			bhtsne.run()
			fs.open('./result.dat', 'r', (err, fd) => {
				if (err) return callback(err)
				// The first two integers are just the number of samples and the dimensionality, no need to read those
				const offset = 4*2
				const resultLen = 8 * opts.dims * dataCount
				const landmarksLen = 4 * dataCount
				// The next part of the data is the unordered results and the landmarks
				fs.read(fd, Buffer.alloc(resultLen + landmarksLen), 0, resultLen + landmarksLen, offset, (err, bytesRead, buffer) => {
					if (err) return callback(err)
					const unorderedResult = []
					for(let i = 0; i < dataCount; i++) {
						const coords = []
						for (let c = 0; c < opts.dims; c++) {
							coords.push(buffer.readDoubleLE(i * 8 * opts.dims + 8 * c))
						}
						let landmark = buffer.readInt32LE(resultLen + 4*i)
						unorderedResult.push([landmark, coords])
					}
					const result = unorderedResult.sort((a,b) => (a[0] - b[0])).map((e) => e[1])

					callback(null, result)
				})
			})
		})
		process.chdir(oldWd)
	})
}
