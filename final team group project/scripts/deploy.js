const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const C = await ethers.getContractFactory("SpendingLimitWallet");
  const c = await C.deploy();
  await c.waitForDeployment();
  const addr = await c.getAddress();
  console.log("SpendingLimitWallet:", addr);

  // Write root address file
  const out = { SpendingLimitWallet: addr };
  fs.writeFileSync(
    path.join(__dirname, "..", "contracts_address.json"),
    JSON.stringify(out, null, 2)
  );

  // Sync to the three frontends
  ["parent", "child", "merchant"].forEach((d) => {
    fs.writeFileSync(
      path.join(__dirname, "..", "apps", d, "contracts_address.json"),
      JSON.stringify(out, null, 2)
    );
  });

  // Copy ABI
  const artifact = require("../artifacts/contracts/SpendingLimitWallet.sol/SpendingLimitWallet.json");
  const abi = JSON.stringify(artifact.abi, null, 2);
  ["parent", "child", "merchant"].forEach((d) => {
    fs.writeFileSync(path.join(__dirname, "..", "apps", d, "abi.json"), abi);
  });

  console.log("Address & ABI copied to apps/*");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
