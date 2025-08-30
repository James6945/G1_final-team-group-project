require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { SEPOLIA_RPC_URL, PRIVATE_KEY, ETHERSCAN_API_KEY } = process.env;

// Use the private key only if the format is valid
const accounts = [];
if (PRIVATE_KEY && /^0x[0-9a-fA-F]{64}$/.test(PRIVATE_KEY.trim())) {
  accounts.push(PRIVATE_KEY.trim());
}

module.exports = {
  defaultNetwork: "hardhat",           // Important: default to local
  solidity: "0.8.20",
  networks: {
    hardhat: {
      chainId: 31337
    },
    sepolia: {
      url: SEPOLIA_RPC_URL || "",
      accounts,                        // Might be [], which avoids HH8
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY || "",
  },
};
