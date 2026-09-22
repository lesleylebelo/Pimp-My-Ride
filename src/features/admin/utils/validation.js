export const shopFields={shopName:'Shop name',regNumber:'Registration number',address:'Address',city:'City',province:'Province',services:'Services'};

export function requiredText(value,label,max){
 if(typeof value!=='string'||!value.trim())return `${label} is required.`;
 return value.trim().length>max?`${label} must be no more than ${max} characters.`:null;
}
export function accountErrors(form,role){
 const errors={fullName:requiredText(form.fullName,'Full name',200),phone:requiredText(form.phone,'Phone',30)};
 if(!errors.phone&&!/^(0\d{9}|\+27\d{9})$/.test(form.phone.trim().replace(/[\s()-]/g,'')))errors.phone='Enter a valid South African phone number.';
 if(role==='shop')for(const [key,label] of Object.entries(shopFields))errors[`shop.${key}`]=requiredText(form.shop?.[key],label,500);
 return errors;
}
export function categoryErrors(form){return {name:requiredText(form.name,'Category name',80),description:requiredText(form.description,'Description',500)};}
export const hasErrors=errors=>Object.values(errors).some(Boolean);
