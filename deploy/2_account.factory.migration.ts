import { Deployer, Reporter } from "@solarity/hardhat-migrate";

import { ERC1967Proxy__factory, SmartAccount__factory, SmartAccountFactory__factory } from "@ethers-v6";

const ENTRY_POINT = "0xC1ECEd7578cDcED435717BDF3a667D3cf418bE0C";

export = async (deployer: Deployer) => {
  let accountFactory = await deployer.deploy(SmartAccountFactory__factory);
  const proxy = await deployer.deploy(ERC1967Proxy__factory, [await accountFactory.getAddress(), "0x"]);
  accountFactory = await deployer.deployed(SmartAccountFactory__factory, await proxy.getAddress());

  const accountImplementation = await deployer.deploy(SmartAccount__factory, [ENTRY_POINT]);

  await accountFactory.__SmartAccountFactory_init(await accountImplementation.getAddress());

  Reporter.reportContracts(["SmartAccountFactory", await accountFactory.getAddress()]);
};
