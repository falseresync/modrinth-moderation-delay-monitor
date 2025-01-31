<template>
  <main class="page">
    <h1>Modrinth moderation delay monitor</h1>

    <h2>Overall delays</h2>
    <ul>
      <li>Median: {{ toDays(overallMedianDelay) }} days</li>
      <li>99th percentile: {{ toDays(overall99PercentileDelay) }} days</li>
    </ul>

    <h2>Delays by project type</h2>
    <template v-for="projectType in projectTypes">
      <h3>Delays for `{{ projectType }}`</h3>
      <ul>
        <li>Median: {{ toDays(delaysByType.get(projectType)?.median) }} days</li>
        <li>99th percentile: {{ toDays(delaysByType.get(projectType)?.$99Percentile) }} days</li>
      </ul>
    </template>
    
    <h2>Explanation</h2>
    <h3>What the numbers mean</h3>
    <p>
      As you can see, there are two numbers: the median delay, and the 99th percentile.
    </p>
    <p>
      The median is what's most relevant for you - it's the time you most likely would have to wait.
      Mathematically speaking, the half of the considered projects have spent less time than that in the queue.
    </p>
    <p>
      The 99th percentile is the maximum time you might have to wait if everything is okay -
      if you have waited more than that, you should probably contact support.
      Mathematically speaking, 99% of the considered projects have spent less time than that in the queue.
    </p>

    <h3>How it's calculated</h3>
    <p>
      To calculate these statistics I have used the `date_created` and `date_modified` fields.
      In order to keep the statistics relevant I only query projects, that have been submitted to the moderation last week.
    </p>
    <p>
      The `date_created` field is populated differently, than one might expect, namely it's
      when the project is reviewed by the moderators and published to the search index, 
      NOT when it's first created.
    </p>
    <p>
      The `date_modified` field on the other hand can be used as a decent metric to guess when the project was submitted to the moderation,
      since people would tend to submit the project immediately after making the changes they want or need.
      However, it is not a perfect metric and I have to check, that it's actually happened before the publication date, 
      i.e. that the project wasn't already updated *after* it passed moderation.
    </p>
    <ul>
      <li>{{ allProjectsData.length }} projects created or modified in the last week queried</li>
      <li>{{ allProjects.length }} projects not modified after publication considered</li>
    </ul>
  </main>
  <footer class="footer">
    falseresync &copy; 2025
  </footer>
</template>

<script setup lang="ts">
import { median, quantile } from 'simple-statistics'

const MILLIS_IN_DAY = 1000 /* s */ * 60 /* m */ * 60 /* h */ * 24 /* d */;
const MILLIS_IN_WEEK = MILLIS_IN_DAY * 7;

function toDays(duration?: number): string {
  if (duration == undefined) {
    return NaN.toFixed(0)
  }
  return (duration / MILLIS_IN_DAY).toFixed(2);
}

interface Delays {
  $99Percentile: number
  median: number
}

interface Project {
  projectType: string
  datePublished: Date
  dateSubmitted: Date
  reviewDelay: number
}

interface ProjectData {
  project_type: string
  loaders: string[]
  date_created: string
  date_modified: string
}

interface SearchResponse {
  hits: ProjectData[]
}

const weekAgo = (Date.now() - MILLIS_IN_WEEK) / 1000 /* has to be in seconds */;
const projectTypes: string[] = await $fetch('https://api.modrinth.com/v2/tag/project_type', {});
const responses: SearchResponse[] = await Promise.all(
  projectTypes.flatMap(
    projectType => [
      $fetch<SearchResponse>(`https://api.modrinth.com/v2/search?index=newest&limit=100&facets=[["project_type:${projectType}"],["modified_timestamp > ${weekAgo}"]]`)
    ]
  )
)

const allProjectsData: ProjectData[] = responses.flatMap(response => response.hits)

const allProjects: Project[] = allProjectsData
  .map(projectData => {
    const datePublished = new Date(projectData.date_created)
    const dateSubmitted =  new Date(projectData.date_modified)
    let projectType = projectData.project_type; 
    switch (projectData.project_type) {
      case 'mod':
        if (projectData.loaders.includes('datapack')) {
          projectType = 'datapack';
        }
        break;
              
    }
    return {
      projectType: projectData.project_type,
      datePublished,
      dateSubmitted,
      reviewDelay: datePublished.getTime() - dateSubmitted.getTime()
    } as Project
  })
  // If the project was updated after it has been reviewed we cannot determine the delay
  .filter(project => project.reviewDelay > 0) 

const allReviewDelays = allProjects.map(project => project.reviewDelay)
const overall99PercentileDelay = quantile(allReviewDelays, 0.99)
const overallMedianDelay = median(allReviewDelays)

const projectsByType: Map<string, Project[]> = Map.groupBy(allProjects, ({ projectType }) => projectType)
const delaysByType: Map<String, Delays> = new Map(
  projectsByType.entries().map(([projectType, projects]) => {
    const delays = projects.map(project => project.reviewDelay)
    return [projectType, { $99Percentile: quantile(delays, 0.99), median: median(delays) } as Delays]
  })
)
</script>

<style>
html,
body {
  font-size: 16px;
}

.page {
  max-width: 50rem;
  margin: 0 auto 5rem auto;
}

.footer {
  max-width: 50rem;
  margin: 0 auto;
  padding: 2rem 0;
}
</style>