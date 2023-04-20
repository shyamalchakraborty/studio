import { Inject, NotImplementedException } from '@nestjs/common';
import _, { range } from 'lodash';

import { IAppToolkit, APP_TOOLKIT } from '~app-toolkit/app-toolkit.interface';
import { ZERO_ADDRESS } from '~app-toolkit/constants/address';
import { PositionTemplate } from '~app-toolkit/decorators/position-template.decorator';
import { drillBalance } from '~app-toolkit/helpers/drill-balance.helper';
import { getLabelFromToken } from '~app-toolkit/helpers/presentation/image.present';
import { DefaultDataProps } from '~position/display.interface';
import { ContractPositionBalance } from '~position/position-balance.interface';
import { MetaType } from '~position/position.interface';
import { ContractPositionTemplatePositionFetcher } from '~position/template/contract-position.template.position-fetcher';
import { GetDisplayPropsParams } from '~position/template/contract-position.template.types';

import { RocketNodeDeposit, RocketPoolContractFactory } from '../contracts';

@PositionTemplate()
export class EthereumRocketPoolMinipoolContractPositionFetcher extends ContractPositionTemplatePositionFetcher<RocketNodeDeposit> {
  groupLabel = 'Minipools';

  constructor(
    @Inject(APP_TOOLKIT) protected readonly appToolkit: IAppToolkit,
    @Inject(RocketPoolContractFactory) protected readonly contractFactory: RocketPoolContractFactory,
  ) {
    super(appToolkit);
  }

  getContract(address: string): RocketNodeDeposit {
    return this.contractFactory.rocketNodeDeposit({ address, network: this.network });
  }

  async getDefinitions() {
    return [{ address: '0x1cc9cf5586522c6f483e84a19c3c2b0b6d027bf0' }];
  }

  async getTokenDefinitions() {
    return [
      {
        metaType: MetaType.SUPPLIED,
        address: ZERO_ADDRESS,
        network: this.network,
      },
    ];
  }

  async getLabel({ contractPosition }: GetDisplayPropsParams<RocketNodeDeposit>) {
    return `Staked ${getLabelFromToken(contractPosition.tokens[0])}`;
  }

  getTokenBalancesPerPosition(): never {
    throw new NotImplementedException();
  }

  async getBalances(address: string): Promise<ContractPositionBalance<DefaultDataProps>[]> {
    const multicall = this.appToolkit.getMulticall(this.network);
    const miniPoolManager = this.contractFactory.rocketMinipoolManager({
      address: '0x6293b8abc1f36afb22406be5f96d893072a8cf3a',
      network: this.network,
    });

    const contractPositions = await this.appToolkit.getAppContractPositions({
      appId: this.appId,
      network: this.network,
      groupIds: [this.groupId],
    });

    const numPositionsRaw = await multicall.wrap(miniPoolManager).getNodeMinipoolCount(address);

    const balances = await Promise.all(
      range(0, numPositionsRaw.toNumber()).map(async index => {
        const miniPoolAddress = await multicall.wrap(miniPoolManager).getNodeMinipoolAt(address, index);

        const miniPoolContract = this.contractFactory.rocketMinipool({
          address: miniPoolAddress,
          network: this.network,
        });

        const depositAmountRaw = await multicall.wrap(miniPoolContract).getNodeDepositBalance();

        const depositAmount = drillBalance(contractPositions[0].tokens[0], depositAmountRaw.toString());

        return {
          ...contractPositions[0],
          tokens: [depositAmount],
          balanceUSD: depositAmount.balanceUSD,
        };
      }),
    );

    return _.compact(balances);
  }
}
