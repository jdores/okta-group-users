/**
 * This worker will make a mapping of okta groups to user ids
 * 
 * The worker can be triggered on demand when querying the worker hostname AND according to a cron schedule
 * 
 * The mapping will be created for the groups specified in the wrangler.toml file
 * 
 * Optional: if we want the output to be saved to R2 when the worker is triggered on demand, configure the wrangler.toml appropriately
 *     If STORE_R2 = true, the output will be saved to the bucket specified in the R2 bindings of wrangler.toml
 *     If STORE_R2 = false, the output will not be saved to an R2 bucket
 */
export default {
	// This function runs when we query the worker hostname
	async fetch(request, env, ctx) {
        return await handleRequest(request, env);
    },
	// This function runs according to the cron schedule
    async scheduled(event, env, ctx) {
        await handleRequest('notfetch',env);
    }
};
	
async function handleRequest(request, env) {

  // Inputs for Okta API calls. Stored locally in .dev.var and in the edge in Workers secrets
  const oktaUrl = env.OKTA_URL;
  const apiToken = env.API_TOKEN;

  // Optimization - if fetch, stop the worker if browser is requesting favicon.ico
  if (request != 'notfetch') {
	const urlRequest = new URL(request.url);
	const checkFavicon = urlRequest.pathname.slice(1);
	if(checkFavicon == "favicon.ico"){
		return new Response(null, { status: 204 });
	}
  }
  
  // STEP 01 - Get Okta groups
  const listGroups = `https://${oktaUrl}/api/v1/groups`;
  const response = await fetch(listGroups, {
       method: 'GET',
       headers: {
        'Accept': 'application/json',
		'Content-Type': 'application/json',
        'Authorization': `SSWS ${apiToken}`
       }
  });
  const data = await response.json();

  // STEP 02 - If Response is OK, we need to get the URL for the user information of each interesting group
  if (response.ok) {
	const groupInfo = []; // Will store all the user, group mapping information

	// Iterate over all groups found in the API response
	for (let group of data) {
	  // For each group found in the API reponse, we check if it matches the interesting groups defined in wrangler.toml
	  for (let groupEnv of env.OKTA_GROUPS){		
		// If it matches, then we find the group details API URL and fetch that data
		if (groupEnv == group.profile.name){		
			const groupUsersResponse = await fetch(group._links.users.href, {
				method: 'GET',
				headers: {
				 'Accept': 'application/json',
				 'Content-Type': 'application/json',
				 'Authorization': `SSWS ${apiToken}`
				}
			});
    		const groupUsersData = await groupUsersResponse.json();
		   
		    if (groupUsersResponse.ok) {
			  // We store the user email and the group name only
			  for (let user of groupUsersData) {
				groupInfo.push({
					email: user.profile.email,
					group: groupEnv
				});
			  }
		    } else {
				console.error(`Error fetching user information for group ${groupEnv}`);
		    }
		}
	  }
	}  

	// Convert output to JSON format
	//const jsonOutput = JSON.stringify(deviceInfo);
	const jsonOutput = JSON.stringify(groupInfo, null, 2);

	// STEP 03 - Store output in R2.
	// If fetch, it only runs if environmental variable STORE_R2 in wrangler.toml is set to true
	// If scheduled, runs everytime
	if(env.STORE_R2 || request == 'notfetch'){ 
		const objectName = env.R2_FILENAME;
		const uploadFile = new Blob([jsonOutput], { type: 'application/json' });
		await env.MY_BUCKET.put(objectName, uploadFile);
	}

	// STEP 04 - If fetch, Worker provides a response
	if (request != 'notfetch') {
		return new Response(jsonOutput, {
			headers: { 'Content-Type': 'application/json' }
		});
	}
  } else {
		// Fetch - if response from API is NOK
		if (request != 'notfetch') {
			return new Response(JSON.stringify({ error: data }), {
				status: response.status,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		// Scheduled - if response from API is NOK
		else{
			console.error(`Error fetching devices: ${JSON.stringify(data)}`);
		}
  }
}