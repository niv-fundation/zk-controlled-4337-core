import { Deployer, Reporter } from "@solarity/hardhat-migrate";

import { EntryPoint__factory, ERC20Mock__factory } from "@ethers-v6";

export = async (deployer: Deployer) => {
  const entryPoint = await deployer.deploy(EntryPoint__factory);

  const token = await deployer.deploy(ERC20Mock__factory, ["Some Token", "ST", 18]);

  Reporter.reportContracts(["Some Token", await token.getAddress()], ["EntryPoint", await entryPoint.getAddress()]);
};
