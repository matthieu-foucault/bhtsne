const bhtsne = require('./build/Release/bhtsne')
const fs = require('fs')
const Buffer = require('buffer').Buffer

const defaultSettings = {
	dims: 2,
	initialDimensions: 50,
	perplexity: 50,
	theta: 0.5,
	maxIterations: 1000,
	verbose: false,
	randseed: -1
}

module.exports = function(data, settings, callback) {
	dataDim = data[0].length
	dataCount = data.length
	settings = Object.assign(defaultSettings, settings)
	const ws = fs.createWriteStream('./data.dat')
	const headerBuff = Buffer.alloc(32, 0)
	headerBuff.writeInt32LE(dataCount, 0)
	headerBuff.writeInt32LE(dataDim, 4)
	headerBuff.writeDoubleLE(settings.theta, 8)
	headerBuff.writeDoubleLE(settings.perplexity, 16)
	headerBuff.writeInt32LE(settings.dims, 24)
	headerBuff.writeInt32LE(settings.maxIterations, 28)
	ws.write(headerBuff)
	const dataBuff = Buffer.alloc(8*dataDim*dataCount, 0)
	for (let n = 0; n < dataCount; n++) {
		for (let d = 0; d < dataDim; d++) {
			dataBuff.writeDoubleLE(data[n][d], 8*n*dataDim + 8*d)
		}
	}
	ws.write(dataBuff)
	if (settings.randseed !== defaultSettings.randseed) {
		const randseedBuff = Buffer.alloc(4, 0)
		randseedBuff.writeInt32LE(settings.randseed, 0)
		ws.write(randseedBuff)
	}
	ws.end()
	ws.on('finish', () => {
		bhtsne.run()
		fs.open('./result.dat', 'r', (err, fd) => {
			if (err) return callback(err)
			const resultLen = 8*2*dataCount
			fs.read(fd, Buffer.alloc(resultLen), 0, 8*2*dataCount, 0, (err, bytesRead, buffer) => {
				if (err) return callback(err)
				const result = []
				for(let i = 0; i < dataCount; i++) {
					let x = buffer.readDoubleLE(i*8*2)
					let y = buffer.readDoubleLE(i*8*2 + 8)
					result.push([x,y])
				}
				callback(null, result)
			})
		})
	})
}
