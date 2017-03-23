const tmp = require('tmp')
const cp = require('child_process')

module.exports = function(data, userOpts, callback) {
	tmp.dir((err, path) => {
		const bp = cp.fork(`${__dirname}/bhtsneProcess.js`, [], {cwd:path})
		bp.send({data, userOpts})

		bp.on('message', (result) => {
			bp.kill()
			callback(null, result)
		})

	})
}
