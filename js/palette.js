// 調色盤：每一格有 4 個顏色。
//   c／d    ：一般模式的淺色／深色主題顏色（支出紅色系、收入綠色系）
//   cb／cbd ：色盲友善模式的淺色／深色主題顏色（支出藍色系、收入黃色系）
// 內建類別固定使用前幾格；自訂類別可以從全部格子裡挑一格。顏色用 OKLCH 挑選，彼此保持足夠的差異。

export const EXPENSE_PALETTE = [
  { c: '#C73100', d: '#FF3E2F', cb: '#646A83', cbd: '#3097B3' },
  { c: '#FE6B98', d: '#FE94AF', cb: '#9FA6C2', cbd: '#84EEFD' },
  { c: '#A4014D', d: '#DE0D6B', cb: '#1D608E', cbd: '#56797D' },
  { c: '#FE5B0A', d: '#FE8053', cb: '#0DA3D4', cbd: '#3BA8FF' },
  { c: '#E41C70', d: '#FE5B90', cb: '#0B7FBC', cbd: '#7FA3A7' },
  { c: '#EBA9B8', d: '#FFBFA9', cb: '#4DCAFD', cbd: '#D9E0FD' },
  { c: '#77422F', d: '#C65021', cb: '#32407A', cbd: '#5360DE' },
  { c: '#9C606F', d: '#A26675', cb: '#5360DE', cbd: '#1277B7' },
  { c: '#C48873', d: '#C7868E', cb: '#7793FE', cbd: '#3885F9' },
  { c: '#63134F', d: '#D050AD', cb: '#2A24A1', cbd: '#7684C6' },
  { c: '#C65DA7', d: '#FA77D3', cb: '#678B8F', cbd: '#ACB8E8' },
  { c: '#6F0F0A', d: '#C7ABBC', cb: '#1F4144', cbd: '#30D9E9' },
];

export const INCOME_PALETTE = [
  { c: '#188C00', d: '#1B9B00', cb: '#958802', cbd: '#9E9219' },
  { c: '#7FC200', d: '#A0D102', cb: '#BAAE3F', cbd: '#F8B325' },
  { c: '#465C12', d: '#96EDC7', cb: '#72604A', cbd: '#F9E50C' },
  { c: '#51A885', d: '#60B793', cb: '#B4A18A', cbd: '#D59239' },
  { c: '#04E1B1', d: '#E8EA5E', cb: '#FEA92F', cbd: '#E6E3C5' },
  { c: '#5A796E', d: '#949523', cb: '#907C67', cbd: '#A6917B' },
  { c: '#C3DC57', d: '#737459', cb: '#E3CDB5', cbd: '#816E58' },
  { c: '#CFD1B3', d: '#BCBDA0', cb: '#F2E252', cbd: '#C5B099' },
];
