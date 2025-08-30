// scripts/deploy_savings.js
const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

async function main () {
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deployer:', deployer.address);

  // Optional: pass SpendingLimitWallet address to SavingsVault (if the constructor requires it)
  // 1) Read env var SPENDING_LIMIT_WALLET first
  // 2) If not provided, try reading it from the root contracts_address.json
  let walletAddr = process.env.SPENDING_LIMIT_WALLET;
  const rootAddrFile = path.join(__dirname, '..', 'contracts_address.json');
  if (!walletAddr && fs.existsSync(rootAddrFile)) {
    try {
      const root = JSON.parse(fs.readFileSync(rootAddrFile, 'utf8'));
      if (root.SpendingLimitWallet) walletAddr = root.SpendingLimitWallet;
    } catch (e) {}
  }

  // Deploy SavingsVault (handles constructor args depending on your contract)
  const Factory = await hre.ethers.getContractFactory('SavingsVault');
  let vault;
  if (walletAddr) {
    console.log('Deploying SavingsVault with SpendingLimitWallet:', walletAddr);
    vault = await Factory.deploy(walletAddr);
  } else {
    console.log('Deploying SavingsVault (no constructor args)...');
    vault = await Factory.deploy();
  }
  await vault.waitForDeployment();
  const addr = await vault.getAddress();
  console.log('SavingsVault:', addr);

  // Read ABI (make sure the path and filename match your contract)
  const artifact = require('../artifacts/contracts/SavingsVault.sol/SavingsVault.json');
  const abi = JSON.stringify(artifact.abi, null, 2);

  // ---- Write address/ABI to root & apps/* ----
  // 1) Update root contracts_address.json
  let merged = {};
  if (fs.existsSync(rootAddrFile)) {
    try { merged = JSON.parse(fs.readFileSync(rootAddrFile, 'utf8')); } catch (e) {}
  }
  merged.SavingsVault = addr;
  fs.writeFileSync(rootAddrFile, JSON.stringify(merged, null, 2));

  // 2) Sync to the four frontend directories (write only if they exist)
  const apps = ['child', 'parent', 'merchant', 'savings'];
  for (const app of apps) {
    const appDir = path.join(__dirname, '..', 'apps', app);
    if (!fs.existsSync(appDir)) continue;

    const addrPath = path.join(appDir, 'contracts_address.json');
    let cur = {};
    if (fs.existsSync(addrPath)) {
      try { cur = JSON.parse(fs.readFileSync(addrPath, 'utf8')); } catch (e) {}
    }
    cur.SavingsVault = addr;
    fs.writeFileSync(addrPath, JSON.stringify(cur, null, 2));

    // Overwrite/write ABI
    fs.writeFileSync(path.join(appDir, 'abi.json'), abi);
  }

  console.log('✓ SavingsVault address & ABI copied to apps/*');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
