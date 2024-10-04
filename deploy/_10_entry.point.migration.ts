import { Deployer } from "@solarity/hardhat-migrate";

import { EntryPoint__factory } from "@ethers-v6";

export = async (deployer: Deployer) => {
  await deployer.deploy(EntryPoint__factory);
};
