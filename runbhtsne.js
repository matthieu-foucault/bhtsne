const bhtsne = require('./build/Release/bhtsne')
const runBHTSNE = () => {
    bhtsne.run()
}

process.on('message', (msg) => {
    runBHTSNE()
    process.send('tsne complete')
})