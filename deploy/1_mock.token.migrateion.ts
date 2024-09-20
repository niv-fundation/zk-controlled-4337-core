import { Deployer, Reporter } from "@solarity/hardhat-migrate";

import { ERC20Mock__factory } from "@ethers-v6";

export = async (deployer: Deployer) => {
  const token = await deployer.deploy(ERC20Mock__factory, ["Some Token", "ST", 18]);

  Reporter.reportContracts(["Some Token", await token.getAddress()]);
};
