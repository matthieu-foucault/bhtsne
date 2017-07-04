const bhtsne = require('./bhtsne')

bhtsne([[1,0],[0,1]],{perplexity:0.1, randseed:12}).catch(console.log).then(console.log)