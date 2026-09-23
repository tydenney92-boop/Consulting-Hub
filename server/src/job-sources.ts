export type JobPostingInput={url?:string;description?:string;company?:string;roleTitle?:string};
export interface JobSourceProvider { name:string; import(input:JobPostingInput):Promise<Partial<JobPostingInput>> }
export class ManualProvider implements JobSourceProvider { name='Manual'; async import(input:JobPostingInput){ return input; } }
/** Future official/API or user-authorized import adapters. No scraping or auth circumvention. */
export class LinkedInProvider implements JobSourceProvider { name='LinkedIn'; async import(_input:JobPostingInput):Promise<Partial<JobPostingInput>>{ throw new Error('LinkedIn official integration is not configured.'); } }
export class IndeedProvider implements JobSourceProvider { name='Indeed'; async import(_input:JobPostingInput):Promise<Partial<JobPostingInput>>{ throw new Error('Indeed official integration is not configured.'); } }
export class HandshakeProvider implements JobSourceProvider { name='Handshake'; async import(_input:JobPostingInput):Promise<Partial<JobPostingInput>>{ throw new Error('Handshake official integration is not configured.'); } }
export class CompanyCareerProvider implements JobSourceProvider { name='Company Career'; async import(_input:JobPostingInput):Promise<Partial<JobPostingInput>>{ throw new Error('Company career integration is not configured.'); } }
