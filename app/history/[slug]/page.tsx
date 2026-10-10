import {HistoryBoard} from '../../history-board';
export default async function Page({params}:{params:Promise<{slug:string}>}){const {slug}=await params;return <HistoryBoard slug={slug}/>;}
