import { Directive } from '@angular/core';
import { BrnCollapsibleContent } from '@spartan-ng/brain/collapsible';
import { classes } from '@spartan-ng/helm/utils';

@Directive({
	selector: '[hlmCollapsibleContent],hlm-collapsible-content',
	exportAs: 'hlmCollapsibleContent',
	hostDirectives: [{ directive: BrnCollapsibleContent, inputs: ['id'] }],
	host: { 'data-slot': 'collapsible-content' },
})
export class HlmCollapsibleContent {
	constructor() {
		classes(
			() =>
				'data-[state=closed]:hidden data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 data-[state=open]:duration-200',
		);
	}
}
