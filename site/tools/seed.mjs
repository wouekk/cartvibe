import {login,caller} from "./lib.mjs";
const c=caller(await login());
const G=1, U=1;
const C={produce:1,dairy:2,bakery:3,meat:4,drinks:6,sweets:8,pantry:10,house:11,rest:16,cafe:18,transit:20,fuel:21,cinema:31,elec:39,subs:37,health:41};
const H="HEALTHY",M="MEDIUM",X="UNHEALTHY",NF="NOT_FOOD";
const S="SEASONAL",O="OUT_OF_SEASON",NP="NOT_PRODUCE";
const receipts=[
 {d:"2026-10-30",shop:"Edeka",lines:[["Bananas 1.2 kg",2.39,C.produce,H,O],["Apples, Elstar",3.49,C.produce,H,S],["Pumpkin, Hokkaido",2.99,C.produce,H,S],["Whole milk 1 L",1.19,C.dairy,H,NP],["Greek yoghurt",1.79,C.dairy,H,NP],["Sourdough loaf",3.60,C.bakery,M,NP],["Chocolate bar",1.99,C.sweets,X,NP],["Cola 6-pack",5.40,C.drinks,X,NP],["Dish soap",2.19,C.house,NF,NP]]},
 {d:"2026-10-27",shop:"Cafe Linde",lines:[["Flat white",3.80,C.cafe,M,NP],["Croissant",2.90,C.bakery,X,NP]]},
 {d:"2026-10-25",shop:"Rewe",lines:[["Chicken breast",8.49,C.meat,H,NP],["Spinach",1.99,C.produce,H,S],["Pasta 500 g",1.29,C.pantry,M,NP],["Tomato sauce",1.49,C.pantry,M,NP],["Parmesan",3.99,C.dairy,M,NP],["Orange juice",2.29,C.drinks,M,NP],["Crisps",2.49,C.sweets,X,NP]]},
 {d:"2026-10-22",shop:"Trattoria Roma",lines:[["Pizza Margherita",11.50,C.rest,M,NP],["Pasta al forno",13.20,C.rest,M,NP],["Tiramisu",6.50,C.rest,X,NP],["Drinks",9.80,C.rest,M,NP]],status:"OPEN"},
 {d:"2026-10-19",shop:"Aral",lines:[["Fuel, 38.4 L",64.20,C.fuel,NF,NP]]},
 {d:"2026-10-17",shop:"Lidl",lines:[["Carrots 1 kg",1.29,C.produce,H,S],["Potatoes 2.5 kg",2.99,C.produce,H,S],["Eggs, free range x10",3.19,C.dairy,H,NP],["Butter",2.39,C.dairy,M,NP],["Rye bread",1.89,C.bakery,H,NP],["Salmon fillet",6.99,C.meat,H,NP],["Ice cream",3.49,C.sweets,X,NP],["Sparkling water 6x1.5 L",3.60,C.drinks,H,NP]]},
 {d:"2026-10-14",shop:"Cinema City",lines:[["Tickets x2",19.00,C.cinema,NF,NP],["Popcorn",6.50,C.sweets,X,NP]]},
 {d:"2026-10-11",shop:"Edeka",lines:[["Grapes",3.99,C.produce,H,S],["Cheddar",2.99,C.dairy,M,NP],["Baguette",1.39,C.bakery,M,NP],["Beef mince",5.99,C.meat,M,NP],["Rice 1 kg",2.29,C.pantry,M,NP],["Coffee beans 500 g",7.99,C.drinks,M,NP]]},
 {d:"2026-10-08",shop:"Transit pass",lines:[["Monthly pass",49.00,C.transit,NF,NP]]},
 {d:"2026-10-05",shop:"Rewe",lines:[["Broccoli",1.79,C.produce,H,S],["Mushrooms",2.29,C.produce,H,S],["Oat milk",1.99,C.drinks,M,NP],["Muesli",3.49,C.pantry,H,NP],["Toilet paper",4.99,C.house,NF,NP],["Wine, red",6.99,C.drinks,X,NP]]},
 {d:"2026-10-03",shop:"Elektro Markt",lines:[["Kettle, 1.7 L",34.99,C.elec,NF,NP]],warranty:"2026-11-20"},
 {d:"2026-10-02",shop:"Streaming",lines:[["Monthly plan",11.99,C.subs,NF,NP]]},
 {d:"2026-09-28",shop:"Edeka",lines:[["Tomatoes",3.49,C.produce,H,S],["Cucumber",0.99,C.produce,H,S],["Milk 2 L",2.38,C.dairy,H,NP],["Bread",2.80,C.bakery,M,NP],["Chicken thighs",6.49,C.meat,M,NP],["Chocolate",2.20,C.sweets,X,NP]]},
 {d:"2026-09-24",shop:"Aral",lines:[["Fuel, 41.0 L",68.10,C.fuel,NF,NP]]},
 {d:"2026-09-20",shop:"Lidl",lines:[["Peaches",3.29,C.produce,H,S],["Yoghurt x4",2.36,C.dairy,H,NP],["Pasta",1.29,C.pantry,M,NP],["Pizza, frozen",2.99,C.pantry,X,NP],["Cola",5.40,C.drinks,X,NP],["Cleaning spray",2.49,C.house,NF,NP]]},
 {d:"2026-09-16",shop:"Trattoria Roma",lines:[["Dinner for two",58.40,C.rest,M,NP]]},
 {d:"2026-09-12",shop:"Rewe",lines:[["Apples",3.99,C.produce,H,S],["Cheese",4.59,C.dairy,M,NP],["Ham",3.29,C.meat,M,NP],["Bread rolls",2.10,C.bakery,M,NP],["Juice",2.29,C.drinks,M,NP]]},
 {d:"2026-09-08",shop:"Transit pass",lines:[["Monthly pass",49.00,C.transit,NF,NP]]},
 {d:"2026-09-04",shop:"Edeka",lines:[["Mixed salad",2.49,C.produce,H,S],["Eggs x10",3.19,C.dairy,H,NP],["Sausages",4.99,C.meat,X,NP],["Beer 6-pack",6.90,C.drinks,X,NP],["Crisps",2.49,C.sweets,X,NP]]},
 {d:"2026-09-02",shop:"Streaming",lines:[["Monthly plan",11.99,C.subs,NF,NP]]},
 {d:"2026-08-29",shop:"Rewe",lines:[["Berries",4.99,C.produce,H,S],["Milk",1.19,C.dairy,H,NP],["Bread",2.80,C.bakery,M,NP],["Steak",9.99,C.meat,M,NP],["Wine",7.50,C.drinks,X,NP]]},
 {d:"2026-08-22",shop:"Lidl",lines:[["Zucchini",1.79,C.produce,H,S],["Tomatoes",2.99,C.produce,H,S],["Cheese",2.99,C.dairy,M,NP],["Water 6x1.5 L",3.60,C.drinks,H,NP],["Ice cream",3.49,C.sweets,X,NP]]},
 {d:"2026-08-15",shop:"Hotel Seeblick",lines:[["Two nights",212.00,C.rest,NF,NP]]},
 {d:"2026-08-10",shop:"Aral",lines:[["Fuel, 44.2 L",72.50,C.fuel,NF,NP]]},
 {d:"2026-08-05",shop:"Edeka",lines:[["Melon",3.49,C.produce,H,S],["Yoghurt",1.79,C.dairy,H,NP],["Bread",2.80,C.bakery,M,NP],["Chicken",7.49,C.meat,H,NP],["Soda",4.20,C.drinks,X,NP]]},
 {d:"2026-08-02",shop:"Streaming",lines:[["Monthly plan",11.99,C.subs,NF,NP]]},
 {d:"2026-07-26",shop:"Rewe",lines:[["Cherries",5.99,C.produce,H,S],["Milk",1.19,C.dairy,H,NP],["Rolls",2.10,C.bakery,M,NP],["Burgers",5.99,C.meat,X,NP]]},
 {d:"2026-07-18",shop:"Lidl",lines:[["Corn",2.49,C.produce,H,S],["Cheese",3.29,C.dairy,M,NP],["Beer",6.90,C.drinks,X,NP],["Charcoal",7.99,C.house,NF,NP]]},
 {d:"2026-07-09",shop:"Aral",lines:[["Fuel, 40.1 L",66.80,C.fuel,NF,NP]]},
 {d:"2026-07-03",shop:"Fahrrad Mueller",lines:[["Bike helmet",49.90,C.health,NF,NP]]},
 {d:"2026-06-27",shop:"Edeka",lines:[["Strawberries",4.49,C.produce,H,S],["Milk",1.19,C.dairy,H,NP],["Bread",2.80,C.bakery,M,NP],["Fish fillet",7.99,C.meat,H,NP]]},
 {d:"2026-06-14",shop:"Lidl",lines:[["Asparagus",6.99,C.produce,H,S],["Eggs",3.19,C.dairy,H,NP],["Wine",6.50,C.drinks,X,NP]]},
 {d:"2026-06-06",shop:"Aral",lines:[["Fuel, 39.0 L",63.40,C.fuel,NF,NP]]},
 {d:"2026-05-30",shop:"Rewe",lines:[["Lettuce",1.49,C.produce,H,S],["Cheese",3.29,C.dairy,M,NP],["Bread",2.80,C.bakery,M,NP]]},
 {d:"2026-02-14",shop:"Elektro Markt",lines:[["Headphones, wireless",129.00,C.elec,NF,NP]],warranty:"2028-02-14"},
];
let n=0;
for(const r of receipts){
  const total=r.lines.reduce((a,l)=>a+l[1],0).toFixed(2);
  const rc=await c("POST","/receipt",{name:`${r.shop} ${r.d}`,shopName:r.shop,amount:total,date:`${r.d}T00:00:00Z`,groupId:G,paidByUserId:U,status:r.status??"RESOLVED",categories:[],tags:[],comments:[]});
  for(const l of r.lines){
    const p=await c("POST",`/receipt-product/receipt/${rc.id}/product`,{name:l[0],amount:l[1].toFixed(2),quantity:"",categoryId:l[2],tagIds:[]});
    await c("PUT",`/receipt-product/product/${p.id}/classification`,{health:l[3],seasonality:l[4]});
  }
  if(r.warranty) await c("PUT",`/receipt/${rc.id}/warranty`,{warrantyUntil:r.warranty});
  n++;
}
console.log("receipts",n);
const mk=async(name,items,checkedN)=>{
  const l=await c("POST",`/shopping-list/group/${G}`,{name});
  const ids=[];
  for(const [nm,amt,unit] of items){const it=await c("POST",`/shopping-list/${l.id}/item`,{name:nm,...(amt?{amount:amt,unit}:{})});ids.push(it.id);}
  for(const id of ids.slice(0,checkedN)) await c("PUT",`/shopping-list/item/${id}/checked`,{isChecked:true});
  return l;
};
await mk("Hardware store",[["Light bulbs"],["Picture hooks"],["Wood glue"]],0);
await mk("Weekly groceries",[["Oat milk","2","l"],["Tomatoes","500","g"],["Eggs","10","pcs"],["Spinach"],["Pasta","1","kg"],["Coffee beans"],["Bread"],["Apples","6","pcs"],["Greek yoghurt"],["Dish soap"]],3);
const prefs=await c("GET","/userPreferences");
await c("PUT","/userPreferences",{...prefs,monthlySpendingGoal:"650",onboardingPending:false});
console.log("done");
