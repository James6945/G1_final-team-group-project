const fs = require("fs");
const path = require("path");
const artifact = require("../artifacts/contracts/SpendingLimitWallet.sol/SpendingLimitWallet.json");
const abi = JSON.stringify(artifact.abi, null, 2);

["parent", "child", "merchant"].forEach((d) => {
  fs.writeFileSync(path.join(__dirname, "..", "apps", d, "abi.json"), abi);
});
console.log("ABI copied.");
