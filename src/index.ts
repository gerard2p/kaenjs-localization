import { readdirSync, existsSync } from 'fs';
import * as i18n from 'i18n';
import { configuration } from '@kaenjs/core/configuration';
import { LocalizationMode } from '@kaenjs/core/configuration/server';
import { KaenContext } from '@kaenjs/core';
import { StandardRequestHeaders } from '@kaenjs/core/headers';
import { parseWithQValues, targetPathNoSrc } from '@kaenjs/core/utils';

declare global {
	namespace KaenExtensible {
		interface KaenContext {
			i18n: typeof i18n
		}
	}
}

const { localization } = configuration.server;
let locales:string[] = [];
if(existsSync(targetPathNoSrc('locales')))
for(const file of readdirSync(targetPathNoSrc('locales'))) {
	let [locale] = file.split('.');
	locales.push(locale);
}
// @ts-ignore
const fallbacks:{[lang:string]:string} = Object.keys(localization.fallbacks).reduce( (prev, current)=>{
	prev[current.toLowerCase()] = localization.fallbacks[current].toLowerCase();
	return prev;
}, {});
function getFallback(locale:string) {
	if( Object.keys(fallbacks).includes(locale)) {
		return fallbacks[locale];
	}
}
function inferLocale(locale:string) {
	if(!locale)return;
	locale = locale.toLowerCase();
	let finalLocale:string;
	if(locales.includes(locale)) {
		finalLocale = locale;
	} else {
		locale = getFallback(locale) || '';
		if(!locale.includes('-'))
			finalLocale = locale;
	}
	if(!finalLocale && locale.includes('-')) {
		return inferLocale(locale.split('-')[0]);
	}
	if(finalLocale) {
		i18n.setLocale(finalLocale);
		return true;
	}
}
const EXTRACTORS = {
	[LocalizationMode.query]: (ctx:KaenContext):boolean => {
		if( localization.queryKey && ctx.params.query && ctx.params.query[localization.queryKey]) {
			return inferLocale(ctx.params.query[localization.queryKey]);
		}
	},
	[LocalizationMode.subdomain]: (ctx:KaenContext):boolean => {
        if(!ctx.subdomain)return;
		return inferLocale(ctx.subdomain.split('.')[0]);
	},
	[LocalizationMode.cookie]: (ctx:KaenContext):boolean => {
		if(localization.cookie) {
			return inferLocale(ctx.cookies.get(localization.cookie));
		}
	},
	[LocalizationMode.header]: (ctx:KaenContext):boolean => {
		const langs = parseWithQValues(ctx.headers[StandardRequestHeaders.AcceptLanguage]);
		return langs.some(lang=>inferLocale(lang));
	},
	[LocalizationMode.url]: (ctx:KaenContext):boolean => {
		let param = ctx.url.path.split('/')[1];
		if(inferLocale(param)) {
			let exp = new RegExp(`/${param}/?`, 'g');
			ctx.url.path = ctx.url.path.replace(exp, '/');
			return true;
		}
	},
	[LocalizationMode.tld]: (ctx:KaenContext):boolean => {
		return inferLocale(ctx.domain.split('.').pop());
	},
	custom(fn:Function) {
		return (ctx:KaenContext):boolean=>{
			return inferLocale(fn(ctx));
		}
	}
}
i18n.configure({
	objectNotation: localization.objectNotation,
	locales,
	directory: targetPathNoSrc(localization.directory),
	defaultLocale: localization.default
});
export async function Localization (ctx:KaenContext) {
    ctx.i18n = i18n;
	configuration.server.localization.modes.some(mode => {
		const parser = typeof mode === 'function' ? EXTRACTORS.custom(mode) : EXTRACTORS[mode];
		return parser && parser(ctx);
    });
}
export { i18n };
