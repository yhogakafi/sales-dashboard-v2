'use client'

import { formatRupiah, formatNumber } from '@/lib/parseData'

export default function RankingTable({ data }) {
  return (
    <div className="table-block">
      <h3 className="block-title">Peringkat pelanggan penagihan</h3>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Pelanggan penagihan</th>
              <th className="num">Total omset</th>
              <th className="num">Total order</th>
              <th className="num">AOV</th>
              <th className="num">% omset</th>
            </tr>
          </thead>
          <tbody>
            {data.rankedCustomers.map((c, i) => {
              const omset = data.customerTotals[c]
              const order = data.customerCounts[c]
              const aov = order > 0 ? omset / order : 0
              const pct = (omset / data.totalOmset) * 100
              return (
                <tr key={c}>
                  <td className="num muted">{i + 1}</td>
                  <td>{c}</td>
                  <td className="num mono">{formatRupiah(omset)}</td>
                  <td className="num mono">{formatNumber(order)}</td>
                  <td className="num mono">{formatRupiah(aov)}</td>
                  <td className="num mono">{pct.toFixed(1)}%</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="num"></td>
              <td>Total</td>
              <td className="num mono">{formatRupiah(data.totalOmset)}</td>
              <td className="num mono">{formatNumber(data.totalOrder)}</td>
              <td className="num mono">{formatRupiah(data.totalOmset / data.totalOrder)}</td>
              <td className="num mono">100.0%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
