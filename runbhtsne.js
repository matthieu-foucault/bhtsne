const bhtsne = require('./build/Release/bhtsne')

const runBHTSNE = () => {
    bhtsne.run()
}

process.on('message', (msg) => {
    try {
        runBHTSNE()
        process.send('tsne complete')
    } catch (e) {
        process.send(e)
    }
})