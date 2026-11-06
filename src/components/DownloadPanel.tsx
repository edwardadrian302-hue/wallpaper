import { ArrowDownToLine, CheckCheck, LoaderCircle, Pause, WifiOff } from 'lucide-react';
import type { DownloadStatus } from '../lib/useDailyDownloads';
export function DownloadPanel({ status, error, automatic, onStart, onPause }: { status: DownloadStatus; error: string; automatic: boolean; onStart: () => void; onPause: () => void }) {
  const complete = status.completed >= status.target;
  const cooling = (status.retryAfterMs ?? 0) > Date.now();
  const problem = error || status.lastError;
  return <section className="download-panel" aria-label="每日联网下载">
    <div className="download-panel-icon">{status.running ? <LoaderCircle className="spin" size={20} /> : complete ? <CheckCheck size={20} /> : problem ? <WifiOff size={20} /> : <ArrowDownToLine size={20} />}</div>
    <div className="download-panel-info"><div className="download-panel-title"><h3>{status.cancelRequested ? '正在停止当前下载…' : status.running ? '好风景，正在抵达' : complete ? '今日壁纸已备好' : automatic ? '每日下载已开启' : '每日下载已暂停'}</h3><span>今日入库 <strong>{status.completed}</strong> / {status.target} 张</span></div><p>{problem || (status.running ? '来源：Wikimedia Commons · 下载完成后自动加入图库' : '联网时补齐今日目标，离线时继续使用本地壁纸。关闭程序后停止下载。')}{cooling && <> · 最早重试 {new Date(status.retryAfterMs!).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</>}</p><div className="download-progress" role="progressbar" aria-label="今日下载进度" aria-valuenow={status.completed} aria-valuemin={0} aria-valuemax={Math.max(status.target, status.completed)}><span style={{ width: `${Math.min(100, status.completed / status.target * 100)}%` }} /></div></div>
    <button className="button button-secondary button-small" disabled={status.cancelRequested || (!status.running && (complete || cooling))} onClick={status.running ? onPause : onStart}>{status.running ? <Pause size={14} /> : <ArrowDownToLine size={14} />}{status.running ? '暂停下载' : complete ? '今日已完成' : cooling ? '等待重试' : status.completed ? '继续补齐' : '立即下载'}</button>
  </section>;
}
