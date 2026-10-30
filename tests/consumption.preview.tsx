// Fixture de interfaz: no lee ni escribe datos reales.
import React from 'react';
import { createRoot } from 'react-dom/client';
import VinosConsumptionScreen from '../components/Vinos/VinosConsumptionScreen';
import { consumptionService, mexicoToday } from '../services/vinos/consumption.service';
import { vinosCustomersService } from '../services/vinos/customers.service';
import { vinosProductsService } from '../services/vinos/products.service';
const fixture: any[] = [{id:'sample',folio:42,branch_id:1,customer_id:'customer',customer_name:'Restaurante La Cantina',due_date:mexicoToday(),created_at:new Date().toISOString(),settled_at:null,status:'OPEN',price_type:'MENUDEO',payment_method:null,sale_id:null,total:0,items:[{id:'item',product_id:'product',product_name:'Tequila Cristalino 750 ml',qty_out:12,qty_returned:0,unit_price:500}]}];
vinosCustomersService.getBranchId=async()=>1;
vinosCustomersService.getAll=async()=>[{id:'customer',name:'Restaurante La Cantina'}] as any;
vinosProductsService.listWithStock=async()=>[{id:'product',name:'Tequila Cristalino 750 ml',sku:'PRO-100',barcode:'750100',total_stock:40,price_retail:500,price_mid_wholesale:480,price_wholesale:450}] as any;
consumptionService.list=async()=>structuredClone(fixture);
consumptionService.credit=async()=>({credit_limit:20000,debt:3000,available:17000,credit_days:30,overdue:false,unknown_due_dates:false,overdue_consumption:false});
consumptionService.create=async input=>{fixture.push({...fixture[0],id:input.id,folio:43,status:'OPEN',settled_at:null,sale_id:null,payment_method:null,total:0,due_date:input.due_date,items:input.items.map((i,n)=>({id:`i${n}`,product_id:i.product_id,product_name:'Tequila Cristalino 750 ml',qty_out:i.qty,qty_returned:0,unit_price:i.unit_price}))});return input.id;};
consumptionService.settle=async(id,actor,payment,returned)=>{const row=fixture.find(r=>r.id===id);row.status='SETTLED';row.settled_at=new Date().toISOString();row.payment_method=payment;row.sale_id='00000000-0000-0000-0000-000000000001';row.items.forEach(i=>i.qty_returned=returned.find(r=>r.id===i.id)!.qty);row.total=row.items.reduce((s,i)=>s+(i.qty_out-i.qty_returned)*i.unit_price,0);return row.sale_id;};
createRoot(document.getElementById('root')!).render(<VinosConsumptionScreen selectedBranchId="VIN-01" branches={[]} currentUser={{id:'actor'} as any}/>);
