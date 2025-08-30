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

  // 写入根地址文件
  const out = { SpendingLimitWallet: addr };
  fs.writeFileSync(
    path.join(__dirname, "..", "contracts_address.json"),
    JSON.stringify(out, null, 2)
  );

  // 同步到三个前端
  ["parent", "child", "merchant"].forEach((d) => {
    fs.writeFileSync(
      path.join(__dirname, "..", "apps", d, "contracts_address.json"),
      JSON.stringify(out, null, 2)
    );
  });

  // 拷贝 ABI
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
