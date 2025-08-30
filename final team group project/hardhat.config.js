require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { SEPOLIA_RPC_URL, PRIVATE_KEY, ETHERSCAN_API_KEY } = process.env;

// 只有当私钥格式正确时才使用它
const accounts = [];
if (PRIVATE_KEY && /^0x[0-9a-fA-F]{64}$/.test(PRIVATE_KEY.trim())) {
  accounts.push(PRIVATE_KEY.trim());
}

module.exports = {
  defaultNetwork: "hardhat",           // 关键：默认本地
  solidity: "0.8.20",
  networks: {
    hardhat: {
      chainId: 31337
    },
    sepolia: {
      url: SEPOLIA_RPC_URL || "",
      accounts,                        // 可能是 []，这样就不会报 HH8
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY || "",
  },
};
