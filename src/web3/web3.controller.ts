import { Controller, Param, Post } from '@nestjs/common';
import { Web3Service } from './web3.service';

@Controller('web3')
export class Web3Controller {
  constructor(private readonly web3Service: Web3Service) {}

  // TODO: do not be lazy and use a proper dto
  @Post(':channel-id/:content/:signature')
  async post(
    @Param('channel-id') channelId: string,
    @Param('content') content: string,
    @Param('signature') signature: string,
  ): Promise<string> {
    return this.web3Service.emitEvent(channelId, content, signature);
  }
}
