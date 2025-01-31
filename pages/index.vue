<template>
  <main class="page">
    <h1>Modrinth moderation delay monitor</h1>
    
    <h2>Overall delays</h2>
    <ul>
      <li>Median: {{ toDays(overallMedianDelay) }} days</li>
      <li>99th percentile: {{ toDays(overall99PercentileDelay) }} days</li>
    </ul>

    <h2>Delays by project type</h2>
    <section class="by-type">
      <template v-for="projectType in PROJECT_TYPES">
        <article>
            <h3>`{{ projectType }}`</h3>
            <ul>
              <li>Median: {{ toDays(delaysByType.get(projectType)?.median) }} days</li>
              <li>99th percentile: {{ toDays(delaysByType.get(projectType)?.$99Percentile) }} days</li>
            </ul>
        </article>
      </template>
    </section>
   

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
      In order to keep the statistics relevant I only query projects, 
      that have been submitted to the moderation last week.
    </p>
    <p>
      The `date_modified` field can be used as a decent metric to guess
      when the project was submitted to the moderation,
      since people would tend to submit the project
      immediately after making the changes they want or need.
    </p>
    <p>
      Then I query all of the found projects and retrieve `approved` and `queued` fields.
    </p>
    <p>
      <strong>{{ allProjects.length }} projects considered</strong>
    </p>
  </main>
  <footer class="footer">
    falseresync &copy; 2025
  </footer>
</template>

<script setup lang="ts">
import { median, quantile } from 'simple-statistics'

const MILLIS_IN_DAY = 1000 /* s */ * 60 /* m */ * 60 /* h */ * 24 /* d */;
const MILLIS_IN_WEEK = MILLIS_IN_DAY * 7;
const WEEK_AGO = (Date.now() - MILLIS_IN_WEEK) / 1000 /* has to be in seconds */;

const PROJECT_TYPES = ['mod', 'modpack', 'datapack', 'resourcepack', 'shader', 'plugin']

class Delays {
  $99Percentile!: number;
  median!: number;
}

interface Project {
  dateApproved: Date
  dateQueued: Date
  reviewDelay: number
}

interface ProjectGetDto {
  approved: string
  queued: string
}

interface ProjectSearchDto {
  project_id: string
}

function toDays(duration?: number): string {
  if (duration == undefined) {
    return NaN.toString()
  }
  return (duration / MILLIS_IN_DAY).toFixed(1);
}

function makeSearchUrl(projectType: string, breakpointDate: number = WEEK_AGO): string {
  return `https://api.modrinth.com/v2/search?index=newest&limit=100&facets=[["project_type:${projectType}"],["modified_timestamp > ${breakpointDate}"]]`;
}

function makeGetUrl(ids: string[]): string {
  return `https://api.modrinth.com/v2/projects?ids=["${ids.join('","')}"]`;
}

const projectIds: Map<string, string[]> = new Map(await Promise.all(
  PROJECT_TYPES.map(
    projectType => $fetch<{ hits: ProjectSearchDto[] }>(makeSearchUrl(projectType))
      .then(response => [projectType, response.hits.map(projectsDto => projectsDto.project_id)] as [string, string[]])
  )
))

const projects: Map<string, Project[]> = new Map(await Promise.all(
  projectIds.entries().toArray()
    .map(([projectType, ids]) => $fetch<ProjectGetDto[]>(makeGetUrl(ids))
      .then(projectGetDtos => {
        return [
          projectType,
          projectGetDtos
            .map(projectGetDto => {
              const datePublished = new Date(projectGetDto.approved)
              const dateSubmitted = new Date(projectGetDto.queued)
              return {
                dateApproved: datePublished,
                dateQueued: dateSubmitted,
                reviewDelay: datePublished.getTime() - dateSubmitted.getTime()
              } as Project
            })
        ] as [string, Project[]]
      }) as Promise<[string, Project[]]>
  )
))

const allProjects: Project[] = projects.values().toArray().flatMap(projectsOfType => projectsOfType)
const allReviewDelays: number[] = allProjects.map(project => project.reviewDelay)
const overall99PercentileDelay: number = quantile(allReviewDelays, 0.99)
const overallMedianDelay: number = median(allReviewDelays)

const delaysByType: Map<String, Delays> = new Map(
  projects.entries().map(([projectType, projects]) => {
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

.by-type {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(3, 1fr);
}

.footer {
  max-width: 50rem;
  margin: 0 auto;
  padding: 2rem 0;
}
</style>