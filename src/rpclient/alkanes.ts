import fetch from 'node-fetch'
import asyncPool from 'tiny-async-pool'
import { AlkanesAMMPoolFactoryDecoder, AllPoolsDetailsResult } from '../amm/factory'
import { AlkanesAMMPoolDecoder, PoolDetailsResult } from '../amm/pool'

export const stripHexPrefix = (s: string): string =>
  s.substr(0, 2) === '0x' ? s.substr(2) : s

export interface AlkaneId {
  block: string
  tx: string
}
export interface Rune {
  rune: {
    id: { block: string; tx: string }
    name: string
    spacedName: string
    divisibility: number
    spacers: number
    symbol: string
  }
  balance: string
}
export interface Outpoint {
  runes: Rune[]
  outpoint: { txid: string; vout: number }
  output: { value: string; script: string }
  txindex: number
  height: 2
}
export interface AlkanesResponse {
  outpoints: Outpoint[]
  balanceSheet: []
}
interface AlkaneSimulateRequest {
  alkanes: any[]
  transaction: string
  block: string
  height: string
  txindex: number
  target: {
    block: string
    tx: string
  }
  inputs: string[]
  pointer: number
  refundPointer: number
  vout: number
}

interface AlkaneToken {
  name: string
  symbol: string
  totalSupply: number
  cap: number
  minted: number
  mintActive: boolean
  percentageMinted: number
  mintAmount: number
}

const opcodes: string[] = ['99', '100', '101', '102', '103', '104', '1000']
const opcodesHRV: string[] = [
  'name',
  'symbol',
  'totalSupply',
  'cap',
  'minted',
  'mintAmount',
  'data',
]

export class AlkanesRpc {
  public alkanesUrl: string

  constructor(url: string) {
    this.alkanesUrl = url
  }

  async _call(method: string, params = []) {
    const requestData = {
      jsonrpc: '2.0',
      method: method,
      params: params,
      id: 1,
    }

    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
      cache: 'no-cache',
    }

    try {
      const response = await fetch(this.alkanesUrl, requestOptions)
      const responseData = await response.json()

      if (responseData.error) throw new Error(responseData.error.message)
      return responseData.result
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error('Request Timeout:', error)
        throw new Error('Request timed out')
      } else {
        console.error('Request Error:', error)
        throw error
      }
    }
  }

  async getAlkanesByHeight({
    height,
    protocolTag = '1',
  }: {
    height: number
    protocolTag: string
  }) {
    return (await this._call('alkanes_protorunesbyheight', [
      {
        height,
        protocolTag,
      },
    ])) as AlkanesResponse
  }

  async getAlkanesByAddress({
    address,
    protocolTag = '1',
    name,
  }: {
    address: string
    protocolTag?: string
    name?: string
  }): Promise<Outpoint[]> {
    const ret = await this._call('alkanes_protorunesbyaddress', [
      {
        address,
        protocolTag,
      },
    ])

    const alkanesList = ret.outpoints
      .filter((outpoint) => outpoint.runes.length > 0)
      .map((outpoint) => ({
        ...outpoint,
        outpoint: {
          vout: outpoint.outpoint.vout,
          txid: Buffer.from(outpoint.outpoint.txid, 'hex')
            .reverse()
            .toString('hex'),
        },
        runes: outpoint.runes.map((rune) => ({
          ...rune,
          balance: parseInt(rune.balance, 16).toString(),
          rune: {
            ...rune.rune,
            id: {
              block: parseInt(rune.rune.id.block, 16).toString(),
              tx: parseInt(rune.rune.id.tx, 16).toString(),
            },
          },
        })),
      }))

    if (name) {
      return alkanesList.flatMap((outpoints) =>
        outpoints.runes.filter((item) => item.rune.name === name)
      )
    }

    return alkanesList
  }

  async trace(request: { vout: number; txid: string }) {
    request.txid = Buffer.from(request.txid, 'hex').reverse().toString('hex')
    const ret = await this._call('alkanes_trace', [request])
    return await ret
  }

  async simulate(request: Partial<AlkaneSimulateRequest>, decoder?: any) {
    const ret = await this._call('alkanes_simulate', [
      {
        alkanes: [],
        transaction: '0x',
        block: '0x',
        height: '20000',
        txindex: 0,
        inputs: [],
        pointer: 0,
        refundPointer: 0,
        vout: 0,
        ...request,
      },
    ])

    if (decoder) {
      const operationType = Number(request.inputs[0])
      ret.parsed = decoder(ret, operationType)
    } else {
      ret.parsed = this.parseSimulateReturn(ret.execution.data)
    }

    return ret
  }

  parseSimulateReturn(v: any) {
    if (v === '0x') {
      return undefined
    }
    const stripHexPrefix = (v: string) => (v.startsWith('0x') ? v.slice(2) : v)
    const addHexPrefix = (v: string) => '0x' + stripHexPrefix(v)

    let decodedString: string
    try {
      decodedString = Buffer.from(stripHexPrefix(v), 'hex').toString('utf8')
      if (/[\uFFFD]/.test(decodedString)) {
        throw new Error('Invalid UTF-8 string')
      }
    } catch (err) {
      decodedString = addHexPrefix(v)
    }

    return {
      string: decodedString,
      bytes: addHexPrefix(v),
      le: BigInt(
        addHexPrefix(
          Buffer.from(
            Array.from(Buffer.from(stripHexPrefix(v), 'hex')).reverse()
          ).toString('hex')
        )
      ).toString(),
      be: BigInt(addHexPrefix(v)).toString(),
    }
  }

  // @dev WIP
  // async meta(request: Partial<AlkaneSimulateRequest>, decoder?: any) {
  //   const ret = await this._call('alkanes___meta', [
  //     {
  //       alkanes: [],
  //       transaction: '0x',
  //       block: '0x',
  //       height: '20000',
  //       txindex: 0,
  //       inputs: [],
  //       pointer: 0,
  //       refundPointer: 0,
  //       vout: 0,
  //       ...request,
  //     },
  //   ])

  //   if (decoder) {
  //     const operationType = Number(request.inputs[0])
  //     ret.parsed = decoder(ret, operationType)
  //   } else {
  //     ret.parsed = this.parseSimulateReturn(ret.execution.data)
  //   }

  //   return ret
  // }

  async getAlkanesByOutpoint({
    txid,
    vout,
    protocolTag = '1',
  }: {
    txid: string
    vout: number
    protocolTag?: string
  }): Promise<any> {
    const alkaneList = await this._call('alkanes_protorunesbyoutpoint', [
      {
        txid: Buffer.from(txid, 'hex').reverse().toString('hex'),
        vout,
        protocolTag,
      },
    ])

    return alkaneList.map((outpoint) => ({
      ...outpoint,
      token: {
        ...outpoint.token,
        id: {
          block: parseInt(outpoint.token.id.block, 16).toString(),
          tx: parseInt(outpoint.token.id.tx, 16).toString(),
        },
      },
      value: parseInt(outpoint.value, 16).toString(),
    }))
  }

  async getAlkaneById({
    block,
    tx,
  }: {
    block: string
    tx: string
  }): Promise<AlkaneToken> {
    const alkaneData: AlkaneToken = {
      name: '',
      mintActive: false,
      percentageMinted: 0,
      symbol: '',
      totalSupply: 0,
      cap: 0,
      minted: 0,
      mintAmount: 0,
    }

    for (let j = 0; j < opcodes.length; j++) {
      try {
        const result = await this.simulate({
          target: { block, tx },
          alkanes: [],
          transaction: '0x',
          block: '0x',
          height: '20000',
          txindex: 0,
          inputs: [opcodes[j]],
          pointer: 0,
          refundPointer: 0,
          vout: 0,
        })
        if (result.status === 0) {
          alkaneData[opcodesHRV[j]] = Number(result.parsed?.le || 0)
          if (
            opcodesHRV[j] === 'name' ||
            opcodesHRV[j] === 'symbol' ||
            opcodesHRV[j] === 'data'
          ) {
            alkaneData[opcodesHRV[j]] = result.parsed?.string || ''
          }
          alkaneData.mintActive =
            Number(alkaneData.minted) < Number(alkaneData.cap)
          alkaneData.percentageMinted = Math.floor(
            (alkaneData.minted / alkaneData.cap) * 100
          )
        }
      } catch (error) {
        console.log(error)
      }
    }
    return alkaneData
  }

  async getAlkanes({
    limit,
    offset = 0,
  }: {
    limit: number
    offset?: number
  }): Promise<AlkaneToken[]> {
    if (limit > 1000) {
      throw new Error(
        'Max limit reached. Request fewer than 1000 alkanes per call'
      )
    }

    const indices = Array.from(
      { length: limit - offset + 1 },
      (_, i) => i + offset
    )

    const processAlkane = async (
      index: number
    ): Promise<AlkaneToken | null> => {
      const alkaneData: any = {
        id: {
          block: '2',
          tx: index.toString(),
        },
      }

      let hasValidResult = false
      const validOpcodes = opcodes.filter((opcode) => opcode !== undefined)

      try {
        const opcodeResults = await Promise.all(
          validOpcodes.map(async (opcode, opcodeIndex) => {
            if (!opcode) return null

            try {
              const result = await this.simulate({
                target: { block: '2', tx: index.toString() },
                alkanes: [],
                transaction: '0x',
                block: '0x',
                height: '20000',
                txindex: 0,
                inputs: [opcode],
                pointer: 0,
                refundPointer: 0,
                vout: 0,
              })

              if (result?.status === 0) {
                return {
                  opcode,
                  result,
                  opcodeIndex,
                  opcodeHRV: opcodesHRV[opcodeIndex],
                }
              }
            } catch (error) {
              return null
            }
            return null
          })
        )
        const validResults = opcodeResults.filter(
          (
            item
          ): item is {
            opcode: any
            result: any
            opcodeIndex: number
            opcodeHRV: string
          } => {
            return (
              item !== null &&
              item !== undefined &&
              item.opcodeHRV !== undefined
            )
          }
        )

        validResults.forEach(({ result, opcodeHRV }) => {
          if (!opcodeHRV) return

          if (['name', 'symbol', 'data'].includes(opcodeHRV)) {
            alkaneData[opcodeHRV] = result.parsed?.string || ''
          } else {
            alkaneData[opcodeHRV] = Number(result.parsed?.le || 0)
          }
          hasValidResult = true
        })

        if (hasValidResult) {
          alkaneData.mintActive =
            Number(alkaneData.minted || 0) < Number(alkaneData.cap || 0)
          alkaneData.percentageMinted = Math.floor(
            ((alkaneData.minted || 0) / (alkaneData.cap || 1)) * 100
          )
          return alkaneData
        }
      } catch (error) {
        console.log(`Error processing alkane at index ${index}:`, error)
      }

      return null
    }

    const results = []
    for await (const result of asyncPool(10, indices, processAlkane)) {
      if (result !== null) {
        results.push(result)
      }
    }

    return results
  }

  async getAllPools({
    block,
    tx,
  }: {
    block: string
    tx: string
  }): Promise<AllPoolsDetailsResult> {
    const request: Partial<AlkaneSimulateRequest> = {
      target: { block, tx },
      inputs: ['3'],
      alkanes: [],
    };

    const poolsWithDetails: (PoolDetailsResult & { poolId: AlkaneId })[] = []

    const { parsed } = await this.simulate(request, AlkanesAMMPoolFactoryDecoder.decodeSimulation);

    for (const poolId of parsed.pools) {
      const poolDetailsRequest = {
        target: poolId,
        inputs: [
          '999',  // opcode 999 = pool_details
        ],
        alkanes: [],
      };
      const { parsed: poolDetails } = await this.simulate(poolDetailsRequest, AlkanesAMMPoolDecoder.decodeSimulation);
      if (poolDetails) {
        poolsWithDetails.push({
          ...poolDetails,
          poolId,
        })
      }
    }

    return {
      count: poolsWithDetails.length,
      pools: poolsWithDetails,
    };
  }
}
