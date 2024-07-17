
 This Cloudflare worker will make a mapping of okta groups to user ids
 
 The worker can be triggered on demand when querying the worker hostname AND according to a cron schedule
 
 The mapping will be created for the groups specified in the wrangler.toml file
 
 Optional: if we want the output to be saved to R2 when the worker is triggered on demand, configure the wrangler.toml appropriately
     If STORE_R2 = true, the output will be saved to the bucket specified in the R2 bindings of wrangler.toml
     If STORE_R2 = false, the output will not be saved to an R2 bucket
 
